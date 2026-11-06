import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyContent } from '@/features/journal/content';
import { sqlJournalFor } from '@/features/journal/runtime';
import { bootApp, resetGateForTests, useGate } from '@/state/gate';
import {
  completeOnboarding,
  hydrateOnboarding,
  resetOnboarding,
  useOnboarding,
} from '@/state/onboarding';
import { createOnboardingPersistence } from '@/state/onboardingStore';
import { resetPreferences, usePreferences } from '@/state/preferences';
import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';

import { deleteAllLocal } from './deleteAllLocal';
import { cancelReminder } from './reminders';

jest.mock('./reminders', () => ({
  cancelReminder: jest.fn(async () => ({ ok: true })),
}));

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1 },
  getEnrolledLevelAsync: jest.fn(async () => 1),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

const SECRET = 'a sentence that must not survive';

let rt: TestRuntime;

async function fullDevice() {
  await hydrateOnboarding(createOnboardingPersistence(rt));
  useOnboarding.getState().update({ intent: 'understand_self', mood: 'heavy' });
  usePreferences.getState().setTheme('day');
  const journal = sqlJournalFor(rt);
  await journal.commitEntry('entry', emptyContent({ body: SECRET }));
  await journal.commitEntry('deleted', emptyContent({ body: 'tombstoned' }));
  await journal.deleteEntry('deleted');
  await journal.saveDraft('draft', emptyContent({ body: 'a draft' }));
  await journal.saveReflection('entry', { status: 'complete', text: 'a reflection' });
  const begun = await journal.beginRecording('voice');
  if (!begun.ok) throw new Error('begin failed');
  const directory = rt.paths.recordingDirs[0] ?? '';
  mkdirSync(directory, { recursive: true });
  const uri = join(directory, `${begun.value.recordingId}.m4a`);
  writeFileSync(uri, 'recorded');
  await journal.attachRecording({
    recordingId: begun.value.recordingId,
    uri,
    draftId: 'voice',
    durationSeconds: 3,
    content: emptyContent({ mode: 'voice' }),
  });
  await completeOnboarding();
}

const count = async (table: string) =>
  (await rt.db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`))?.total;

beforeEach(async () => {
  resetGateForTests();
  resetOnboarding();
  resetPreferences();
  rt = await createTestRuntime();
  installRuntime(rt);
  await fullDevice();
});

afterEach(() => installRuntime(null));

describe('deleteAllLocal', () => {
  it('removes every row, file, and setting', async () => {
    expect(await deleteAllLocal()).toEqual({ ok: true });

    for (const table of ['entries', 'audio', 'recordings', 'reflections']) {
      expect(await count(table)).toBe(0);
    }
    expect(rt.files.list(rt.paths.audioDir)).toEqual([]);
    // Only the new canary of the fresh start remains.
    expect(await count('sealed_kv')).toBe(1);
    expect(await count('preferences')).toBe(0);
  });

  it('removes leftover plaintext as well', async () => {
    const directory = rt.paths.recordingDirs[0] ?? '';
    mkdirSync(directory, { recursive: true });
    const recording = join(directory, 'stranded.m4a');
    writeFileSync(recording, 'plaintext audio');
    mkdirSync(rt.paths.tempDir, { recursive: true });
    const decrypted = join(rt.paths.tempDir, 'copy.m4a');
    writeFileSync(decrypted, 'plaintext audio');

    await deleteAllLocal();

    expect(existsSync(recording)).toBe(false);
    expect(existsSync(decrypted)).toBe(false);
  });

  it('replaces the encryption key, so old ciphertext is dead anywhere it survives', async () => {
    const before = [...rt.secrets.items.values()][0];
    await deleteAllLocal();
    expect(rt.secrets.items.size).toBe(1);
    expect([...rt.secrets.items.values()][0]).not.toBe(before);
  });

  it('cancels the reminder', async () => {
    await deleteAllLocal();
    expect(cancelReminder).toHaveBeenCalled();
  });

  it('returns the app to a first launch with Night as the theme', async () => {
    await deleteAllLocal();
    expect(useOnboarding.getState().intent).toBeUndefined();
    expect(useOnboarding.getState().completedAt).toBeUndefined();
    expect(usePreferences.getState().theme).toBe('night');
    expect(useGate.getState().status).toEqual({ kind: 'ready', resume: '/' });
  });

  it('leaves nothing recognisable on disk', async () => {
    await deleteAllLocal();
    await rt.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    expect(everyStoredByte(rt.root).includes(SECRET)).toBe(false);
  });

  it('keeps the key if the data could not be removed, so nothing is stranded', async () => {
    const before = [...rt.secrets.items.values()][0];
    const journal = sqlJournalFor(rt);
    jest.spyOn(journal, 'wipe').mockRejectedValue(new Error('database is locked'));

    expect(await deleteAllLocal()).toEqual({ ok: false, code: 'delete_incomplete' });

    expect([...rt.secrets.items.values()][0]).toBe(before);
    const entry = await journal.getEntry('entry');
    expect(entry.ok && entry.value?.body).toBe(SECRET);
    expect(useOnboarding.getState().intent).toBe('understand_self');
  });

  it('is the way out of the key-loss state', async () => {
    rt.secrets.items.clear();
    await bootApp();
    expect(useGate.getState().status).toEqual({ kind: 'key_lost', reason: 'missing' });

    expect(await deleteAllLocal()).toEqual({ ok: true });

    expect(useGate.getState().status).toEqual({ kind: 'ready', resume: '/' });
    expect(rt.secrets.items.size).toBe(1);
  });
});
