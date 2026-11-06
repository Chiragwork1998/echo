import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import {
  createTestRuntime,
  everyStoredByte,
  nodeFiles,
  type TestRuntime,
} from '@/storage/testing/nodePorts';

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

afterEach(() => {
  jest.restoreAllMocks();
  installRuntime(null);
});

/** Every sealed value now stored, and each encrypted recording: what must not survive. */
async function allCiphertext(): Promise<Buffer[]> {
  const rows = await rt.db.all<{ sealed: Uint8Array }>(
    `SELECT sealed FROM entries WHERE sealed IS NOT NULL
     UNION ALL SELECT sealed FROM reflections WHERE sealed IS NOT NULL
     UNION ALL SELECT sealed_meta FROM audio
     UNION ALL SELECT sealed FROM sealed_kv WHERE key <> 'canary'`,
  );
  const audio = readdirSync(rt.paths.audioDir).map((name) =>
    readFileSync(join(rt.paths.audioDir, name)),
  );
  return [...rows.map((row) => Buffer.from(row.sealed)), ...audio];
}

async function relaunch() {
  resetGateForTests();
  resetOnboarding();
  resetPreferences();
  await bootApp();
}

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

  it('leaves no ciphertext on disk, in the database or its write-ahead log', async () => {
    // Text never reaches the disk as text, so searching for it proves nothing. The sealed bytes do
    // reach it, and the old key opens them if a copy of the key ever survives anywhere.
    const secrets = await allCiphertext();
    expect(secrets.length).toBeGreaterThan(4);
    const before = everyStoredByte(rt.root);
    for (const secret of secrets) expect(before.includes(secret)).toBe(true);

    await deleteAllLocal();

    const after = everyStoredByte(rt.root);
    for (const secret of secrets) expect(after.includes(secret)).toBe(false);
  });

  describe('when it fails part way through', () => {
    const failures: [string, () => void][] = [
      [
        'deleting the rows',
        () => jest.spyOn(rt.db, 'run').mockRejectedValueOnce(new Error('database is locked')),
      ],
      [
        'emptying the write-ahead log',
        () => jest.spyOn(rt.db, 'first').mockRejectedValueOnce(new Error('database is locked')),
      ],
      [
        'removing the audio',
        () =>
          jest.spyOn(nodeFiles, 'removeDirectory').mockImplementationOnce(() => {
            throw new Error('EBUSY');
          }),
      ],
      [
        'removing the plaintext',
        () =>
          jest
            .spyOn(nodeFiles, 'removeDirectory')
            .mockImplementationOnce(() => undefined)
            .mockImplementationOnce(() => {
              throw new Error('EBUSY');
            }),
      ],
      [
        'removing the key',
        () => {
          rt.secrets.remove = () => Promise.reject(new Error('interaction not allowed'));
        },
      ],
    ];

    it.each(failures)('reports failure at %s and keeps the key', async (_step, breakIt) => {
      const before = [...rt.secrets.items.values()][0];
      breakIt();

      expect(await deleteAllLocal()).toEqual({ ok: false, code: 'delete_incomplete' });

      expect([...rt.secrets.items.values()][0]).toBe(before);
      expect(useOnboarding.getState().intent).toBe('understand_self');
    });

    it.each(failures)(
      'keeps what is written next readable after failing at %s',
      async (_step, breakIt) => {
        breakIt();
        await deleteAllLocal();
        jest.restoreAllMocks();

        const journal = sqlJournalFor(rt);
        const saved = await journal.commitEntry('after', emptyContent({ body: 'written after' }));
        expect(saved.ok).toBe(true);

        await relaunch();

        expect(useGate.getState().status.kind).toBe('ready');
        const entry = await sqlJournalFor(rt).getEntry('after');
        expect(entry.ok && entry.value?.body).toBe('written after');
      },
    );

    it.each(failures)('can simply be run again after failing at %s', async (_step, breakIt) => {
      const remove = rt.secrets.remove;
      breakIt();
      await deleteAllLocal();
      jest.restoreAllMocks();
      rt.secrets.remove = remove;

      expect(await deleteAllLocal()).toEqual({ ok: true });

      expect(await count('entries')).toBe(0);
      expect(useGate.getState().status).toEqual({ kind: 'ready', resume: '/' });
    });
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
