import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, renderHook } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { takeLostRecordings } from '@/features/journal/api';
import { emptyContent } from '@/features/journal/content';
import { sqlJournalFor } from '@/features/journal/runtime';
import { useDraft } from '@/features/journal/useDraft';
import { DatabaseTooNewError } from '@/storage/migrations';
import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, nodeAes, type TestRuntime } from '@/storage/testing/nodePorts';

import {
  bootApp,
  disableLock,
  handleAppState,
  RELOCK_AFTER_MS,
  resetGateForTests,
  unlock,
  useGate,
} from './gate';
import {
  completeOnboarding,
  flushOnboarding,
  hydrateOnboarding,
  resetOnboarding,
  useOnboarding,
} from './onboarding';
import { createOnboardingPersistence } from './onboardingStore';
import { resetPreferences, usePreferences } from './preferences';

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(async () => 3),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

const enrolled = jest.mocked(LocalAuthentication.getEnrolledLevelAsync);
const authenticate = jest.mocked(LocalAuthentication.authenticateAsync);

const FAILURES_THAT_ARE_NOT_NO_CREDENTIALS = [
  'user_cancel',
  'system_cancel',
  'app_cancel',
  'user_fallback',
  'timeout',
  'lockout',
  'authentication_failed',
  'not_available',
  'no_space',
  'invalid_context',
  'unable_to_process',
  'unknown',
] satisfies LocalAuthentication.LocalAuthenticationError[];

let rt: TestRuntime;

/** Prepares a device that has already been used, then clears memory as a restart would. */
async function usedDevice(setup: () => void | Promise<void>) {
  await hydrateOnboarding(createOnboardingPersistence(rt));
  await setup();
  await flushOnboarding();
  resetOnboarding();
  resetPreferences();
}

const status = () => useGate.getState().status;
const lock = () => useGate.getState().lock;

beforeEach(async () => {
  resetGateForTests();
  resetOnboarding();
  resetPreferences();
  rt = await createTestRuntime();
  installRuntime(rt);
  enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
  authenticate.mockReset();
  authenticate.mockResolvedValue({ success: true });
});

afterEach(() => installRuntime(null));

describe('routing a launch', () => {
  it('sends a first launch to Landing', async () => {
    await bootApp();
    expect(status()).toEqual({ kind: 'ready', resume: '/' });
    expect(lock()).toEqual({ kind: 'unlocked' });
  });

  it('resumes onboarding at the current step with choices restored', async () => {
    await usedDevice(() => useOnboarding.getState().update({ intent: 'quiet', step: 5 }));
    await bootApp();
    expect(status()).toEqual({ kind: 'ready', resume: '/onboarding/privacy' });
    expect(useOnboarding.getState().intent).toBe('quiet');
  });

  it('sends a completed user Home', async () => {
    await usedDevice(async () => {
      await completeOnboarding();
    });
    await bootApp();
    expect(status()).toEqual({ kind: 'ready', resume: '/home' });
  });

  it('moves to Completion when the first entry made it to disk but the step did not', async () => {
    await usedDevice(async () => {
      useOnboarding.getState().update({ step: 7 });
      await sqlJournalFor(rt).commitEntry('first', emptyContent({ body: 'my first echo' }));
    });
    await bootApp();
    expect(status()).toEqual({ kind: 'ready', resume: '/onboarding/completion' });
  });

  it('treats unreadable onboarding with entries as finished, not as a new user', async () => {
    await usedDevice(async () => {
      useOnboarding.getState().update({ intent: 'quiet' });
      await flushOnboarding();
      await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'kept' }));
    });
    await rt.db.exec(`UPDATE sealed_kv SET sealed = x'01' WHERE key = 'onboarding'`);
    await bootApp();
    expect(status()).toEqual({ kind: 'ready', resume: '/home' });
  });

  it('restores the theme', async () => {
    await rt.db.run(`INSERT INTO preferences (key, value) VALUES ('theme', 'day')`);
    await bootApp();
    expect(usePreferences.getState().theme).toBe('day');
  });

  it('sweeps recordings before the user can reach anything', async () => {
    const directory = rt.paths.recordingDirs[0] ?? '';
    mkdirSync(directory, { recursive: true });
    const uri = join(directory, 'stranded.aac');
    writeFileSync(uri, 'x'.repeat(4096));
    await bootApp();
    expect(existsSync(uri)).toBe(false);
    const drafts = await sqlJournalFor(rt).listDrafts();
    expect(drafts.ok && drafts.value).toHaveLength(1);
  });

  describe('a recording the OS evicted before it could be encrypted', () => {
    const draftAfterBoot = async () => {
      const view = await renderHook(() => useDraft());
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });
      return view;
    };

    beforeEach(async () => {
      takeLostRecordings();
      const journal = sqlJournalFor(rt);
      await journal.saveDraft('a', emptyContent({ body: 'words' }));
      // A ledger row with no file: the cache was cleared while the app was away.
      await journal.beginRecording('a');
    });

    it('is reported on the next draft, which still opens normally', async () => {
      await bootApp();
      const view = await draftAfterBoot();
      expect(view.result.current).toMatchObject({
        status: 'ready',
        id: 'a',
        error: { code: 'audio_failed', retryable: false },
      });
      expect(view.result.current.content.body).toBe('words');
      await view.unmount();
    });

    it('is reported once, not on every draft after it', async () => {
      await bootApp();
      const first = await draftAfterBoot();
      await first.unmount();
      const second = await draftAfterBoot();
      expect(second.result.current.error).toBeNull();
      await second.unmount();
    });

    it('is not reported when nothing was lost', async () => {
      await sqlJournalFor(rt).recoverLeftovers();
      takeLostRecordings();
      await bootApp();
      const view = await draftAfterBoot();
      expect(view.result.current.error).toBeNull();
      await view.unmount();
    });
  });

  it('does not let a failed sweep keep anyone out', async () => {
    const journal = sqlJournalFor(rt);
    jest.spyOn(journal, 'recoverLeftovers').mockRejectedValue(new Error('sweep failed'));
    await bootApp();
    expect(status().kind).toBe('ready');
  });
});

describe('when the key is lost', () => {
  it('stops at a recoverable state and changes nothing', async () => {
    await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'kept' }));
    const saved = new Map(rt.secrets.items);
    rt.secrets.items.clear();
    const writes = rt.secrets.writes;

    await bootApp();

    expect(status()).toEqual({ kind: 'key_lost', reason: 'missing' });
    expect(rt.secrets.items.size).toBe(0);
    expect(rt.secrets.writes).toBe(writes);

    // Retry after the key comes back, and everything is there.
    for (const [name, value] of saved) rt.secrets.items.set(name, value);
    await bootApp();
    expect(status().kind).toBe('ready');
    const entry = await sqlJournalFor(rt).getEntry('a');
    expect(entry.ok && entry.value?.body).toBe('kept');
  });

  it('reports a different key separately', async () => {
    const name = [...rt.secrets.items.keys()][0] ?? '';
    rt.secrets.items.set(name, await nodeAes.generateKey());
    await bootApp();
    expect(status()).toEqual({ kind: 'key_lost', reason: 'mismatch' });
  });

  it('does not mistake one passing AES failure for a lost key', async () => {
    await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'kept' }));
    const decrypt = jest.spyOn(nodeAes, 'decrypt');
    decrypt.mockRejectedValueOnce(new Error('native: transient'));
    await bootApp();
    decrypt.mockRestore();
    expect(status().kind).toBe('ready');
  });

  it('never offers Start over while AES itself is failing', async () => {
    await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'kept' }));
    const decrypt = jest.spyOn(nodeAes, 'decrypt');
    decrypt.mockRejectedValue(new Error('native: out of memory'));
    await bootApp();
    decrypt.mockRestore();
    expect(status()).toEqual({ kind: 'storage_error', reason: 'database' });
  });

  it('removes a left-behind export or playback copy even without a key', async () => {
    mkdirSync(rt.paths.tempDir, { recursive: true });
    const uri = join(rt.paths.tempDir, 'echo-export.zip');
    writeFileSync(uri, 'every word they ever wrote');
    await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'kept' }));
    rt.secrets.items.clear();

    await bootApp();

    expect(status().kind).toBe('key_lost');
    expect(existsSync(uri)).toBe(false);
  });

  it('runs no sweep without a key, so plaintext is left to be rescued later', async () => {
    const directory = rt.paths.recordingDirs[0] ?? '';
    mkdirSync(directory, { recursive: true });
    const uri = join(directory, 'stranded.aac');
    writeFileSync(uri, 'x'.repeat(4096));
    rt.secrets.items.clear();
    await bootApp();
    expect(existsSync(uri)).toBe(true);
  });
});

describe('storage faults', () => {
  it('reports a locked device and retries by itself on return', async () => {
    rt.secrets.failReads = true;
    await bootApp();
    expect(status()).toEqual({ kind: 'storage_error', reason: 'secure_store' });

    rt.secrets.failReads = false;
    handleAppState('active');
    await bootApp();
    expect(status().kind).toBe('ready');
  });

  it('reports a database from a newer app', async () => {
    installRuntime(null);
    jest.spyOn(jest.requireActual('@/storage/runtime'), 'getRuntime').mockImplementation(() => {
      throw new DatabaseTooNewError();
    });
    await bootApp();
    expect(status()).toEqual({ kind: 'storage_error', reason: 'database_too_new' });
    jest.restoreAllMocks();
  });
});

describe('biometric lock', () => {
  async function lockedDevice() {
    await usedDevice(async () => {
      useOnboarding.getState().update({
        privacy: { biometricLock: true, privateBackup: false },
      });
      await completeOnboarding();
    });
    await bootApp();
  }

  it('is resolved before the navigator can mount', async () => {
    await lockedDevice();
    expect(status().kind).toBe('ready');
    expect(lock()).toMatchObject({ kind: 'locked', method: 'biometric', canDisable: false });
  });

  it('stays off when the user never turned it on', async () => {
    await bootApp();
    expect(lock().kind).toBe('unlocked');
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('opens on success', async () => {
    await lockedDevice();
    await unlock();
    expect(lock().kind).toBe('unlocked');
  });

  it('stays locked and says why on failure', async () => {
    await lockedDevice();
    authenticate.mockResolvedValue({ success: false, error: 'user_cancel' });
    await unlock();
    expect(lock()).toMatchObject({ kind: 'locked', failure: 'cancelled', canDisable: false });
  });

  it('allows the device passcode as fallback, so unenrolling cannot lock anyone out', async () => {
    await lockedDevice();
    await unlock();
    expect(authenticate.mock.lastCall?.[0]?.disableDeviceFallback).toBe(false);
  });

  it('survives biometrics being unenrolled: the passcode still opens it', async () => {
    enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
    await lockedDevice();
    expect(lock()).toMatchObject({ method: 'passcode', canDisable: false });
    await unlock();
    expect(lock().kind).toBe('unlocked');
  });

  it('offers to turn off when the device has no credential left at all', async () => {
    enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    await lockedDevice();
    expect(lock()).toMatchObject({ method: 'none', canDisable: true });

    expect(await disableLock()).toBe(true);
    expect(lock().kind).toBe('unlocked');
    expect(useOnboarding.getState().privacy.biometricLock).toBe(false);
  });

  it('remembers turning off through a restart', async () => {
    enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    await lockedDevice();
    await disableLock();
    await flushOnboarding();
    resetOnboarding();
    await bootApp();
    expect(lock().kind).toBe('unlocked');
  });

  it('refuses to turn off while a credential exists, whatever the screen shows', async () => {
    await lockedDevice();
    expect(await disableLock()).toBe(false);
    expect(lock().kind).toBe('locked');
    expect(useOnboarding.getState().privacy.biometricLock).toBe(true);
  });

  it('rechecks at the moment of turning off, not when the screen was drawn', async () => {
    enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    await lockedDevice();
    enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
    expect(await disableLock()).toBe(false);
    expect(lock()).toMatchObject({ kind: 'locked', canDisable: false });
  });

  // Any of these can be produced by the person holding the phone: leave the prompt to time out, cover
  // a smudged sensor, fill the storage. Repeating one must never turn the lock off.
  it.each(FAILURES_THAT_ARE_NOT_NO_CREDENTIALS)(
    'never offers the way out however often the prompt reports %s',
    async (error) => {
      await lockedDevice();
      authenticate.mockResolvedValue({ success: false, error });
      for (let attempt = 0; attempt < 10; attempt += 1) await unlock();

      expect(lock()).toMatchObject({ kind: 'locked', canDisable: false });
      expect(await disableLock()).toBe(false);
      expect(lock().kind).toBe('locked');
      expect(useOnboarding.getState().privacy.biometricLock).toBe(true);
    },
  );

  it('never offers the way out when the prompt keeps throwing', async () => {
    await lockedDevice();
    authenticate.mockRejectedValue(new Error('no activity'));
    for (let attempt = 0; attempt < 10; attempt += 1) await unlock();
    expect(lock()).toMatchObject({ kind: 'locked', failure: 'system', canDisable: false });
    expect(await disableLock()).toBe(false);
  });

  it('keeps the lock when the prompt says no credentials but the device still has one', async () => {
    await lockedDevice();
    authenticate.mockResolvedValue({ success: false, error: 'not_enrolled' });
    await unlock();
    expect(lock()).toMatchObject({ failure: 'no_credentials', canDisable: false });
    expect(await disableLock()).toBe(false);
  });

  it('waits for a tap after a timeout instead of prompting again', async () => {
    await lockedDevice();
    authenticate.mockResolvedValue({ success: false, error: 'timeout' });
    await unlock();
    // A lock with failure: null prompts at once, which would put the prompt straight back up.
    expect(lock()).toMatchObject({ kind: 'locked', failure: 'cancelled' });
  });

  it('wrong attempts never earn the way out', async () => {
    await lockedDevice();
    authenticate.mockResolvedValue({ success: false, error: 'authentication_failed' });
    for (let attempt = 0; attempt < 6; attempt += 1) await unlock();
    expect(lock()).toMatchObject({ canDisable: false, failure: 'failed' });
  });

  it('fails closed if the capability check itself fails', async () => {
    enrolled.mockRejectedValue(new Error('native error'));
    await lockedDevice();
    expect(lock()).toMatchObject({ method: 'passcode', canDisable: false });
  });
});

describe('when onboarding cannot be read', () => {
  const sealedRecord = async () =>
    (
      await rt.db.first<{ sealed: Uint8Array }>(
        "SELECT sealed FROM sealed_kv WHERE key = 'onboarding'",
      )
    )?.sealed;

  async function finishedDevice(privacy: { biometricLock: boolean; privateBackup: boolean }) {
    await usedDevice(async () => {
      useOnboarding.getState().update({ privacy, intent: 'direction' });
      await completeOnboarding();
      await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'kept' }));
    });
  }

  const corrupt = () => rt.db.exec(`UPDATE sealed_kv SET sealed = x'01' WHERE key = 'onboarding'`);

  async function restart() {
    resetGateForTests();
    resetOnboarding();
    resetPreferences();
    await bootApp();
  }

  /** Fails only the onboarding read of the next boot: the canary comes first and opens. */
  function failOnboardingRead() {
    const decrypt = nodeAes.decrypt;
    let calls = 0;
    return jest.spyOn(nodeAes, 'decrypt').mockImplementation(async (key, sealed, aad) => {
      calls += 1;
      if (calls === 2) throw new Error('native: out of memory');
      return decrypt(key, sealed, aad);
    });
  }

  it('locks, because the record it cannot read may have said to', async () => {
    await finishedDevice({ biometricLock: true, privateBackup: false });
    await corrupt();
    await bootApp();
    expect(status()).toEqual({ kind: 'ready', resume: '/home' });
    expect(lock()).toMatchObject({ kind: 'locked', method: 'biometric', canDisable: false });
  });

  it('locks after a passing AES error too, which looks the same from here', async () => {
    await finishedDevice({ biometricLock: true, privateBackup: false });
    const spy = failOnboardingRead();
    await bootApp();
    spy.mockRestore();
    expect(lock().kind).toBe('locked');
  });

  it('stays locked on return from the background as well', async () => {
    await finishedDevice({ biometricLock: true, privateBackup: false });
    await corrupt();
    await bootApp();
    await unlock();
    expect(lock().kind).toBe('unlocked');
    handleAppState('background', 1_000_000);
    handleAppState('active', 1_000_000 + RELOCK_AFTER_MS);
    await new Promise((resolve) => setImmediate(resolve));
    expect(lock().kind).toBe('locked');
  });

  it('never replaces the record, whatever happens in this session', async () => {
    await finishedDevice({ biometricLock: true, privateBackup: false });
    await corrupt();
    const before = await sealedRecord();
    await bootApp();
    useOnboarding.getState().update({ intent: 'quiet', mood: 'heavy' });
    await completeOnboarding();
    await flushOnboarding();
    expect(await sealedRecord()).toEqual(before);
  });

  it('gets everything back on the next launch after a passing AES error', async () => {
    await finishedDevice({ biometricLock: false, privateBackup: true });
    const healthy = await sealedRecord();
    const spy = failOnboardingRead();
    await bootApp();
    await flushOnboarding();
    spy.mockRestore();
    expect(await sealedRecord()).toEqual(healthy);

    await restart();
    expect(useOnboarding.getState()).toMatchObject({
      intent: 'direction',
      privacy: { biometricLock: false, privateBackup: true },
    });
    expect(lock().kind).toBe('unlocked');
  });

  it('still lets someone with no credential in, and does not record that it did', async () => {
    enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    await finishedDevice({ biometricLock: true, privateBackup: false });
    await corrupt();
    const before = await sealedRecord();
    await bootApp();
    expect(lock()).toMatchObject({ method: 'none', canDisable: true });

    expect(await disableLock()).toBe(true);
    await flushOnboarding();
    expect(await sealedRecord()).toEqual(before);

    await restart();
    expect(lock().kind).toBe('locked');
  });

  it('never unlocks a first launch that merely has no record', async () => {
    await bootApp();
    expect(lock().kind).toBe('unlocked');
  });
});

describe('relocking', () => {
  const start = 1_000_000;

  async function unlockedWithLock() {
    await usedDevice(async () => {
      useOnboarding.getState().update({
        privacy: { biometricLock: true, privateBackup: false },
      });
      await completeOnboarding();
    });
    await bootApp();
    await unlock();
  }

  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it('locks again after time away', async () => {
    await unlockedWithLock();
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS);
    await settle();
    expect(lock().kind).toBe('locked');
  });

  it('does not lock after a brief trip out', async () => {
    await unlockedWithLock();
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS - 1);
    await settle();
    expect(lock().kind).toBe('unlocked');
  });

  it('locks when the clock went back while away, since the time away is then unknown', async () => {
    await unlockedWithLock();
    handleAppState('background', start);
    handleAppState('active', start - 60 * 60 * 1000);
    await settle();
    expect(lock().kind).toBe('locked');
  });

  it('locks in the same tick, before the cover can lift', async () => {
    await unlockedWithLock();
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS);
    expect(lock().kind).toBe('locked');
  });

  it('shows what it knows at once, then what the device says', async () => {
    await unlockedWithLock();
    handleAppState('background', start);
    enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
    handleAppState('active', start + RELOCK_AFTER_MS);
    expect(lock()).toMatchObject({ method: 'biometric', failure: null, canDisable: false });
    await settle();
    expect(lock()).toMatchObject({ method: 'passcode', failure: null, canDisable: false });
  });

  it('never offers the way out before the device has been asked', async () => {
    enrolled.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    await unlockedWithLock();
    await disableLock();
    useOnboarding.getState().update({ privacy: { biometricLock: true, privateBackup: false } });
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS);
    expect(lock()).toMatchObject({ kind: 'locked', canDisable: false });
    await settle();
    expect(lock()).toMatchObject({ kind: 'locked', method: 'none', canDisable: true });
  });

  it('assumes no more than a passcode if the method was never learned', async () => {
    await usedDevice(async () => {
      await completeOnboarding();
    });
    await bootApp();
    useOnboarding.getState().update({ privacy: { biometricLock: true, privateBackup: false } });
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS);
    expect(lock()).toMatchObject({ kind: 'locked', method: 'passcode', canDisable: false });
    await settle();
  });

  it('does not lock again if the prompt answered before the device did', async () => {
    await unlockedWithLock();
    let answerLevel = (_level: number) => undefined as void;
    enrolled.mockReturnValueOnce(new Promise((resolve) => (answerLevel = resolve)));
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS);

    await unlock();
    expect(lock().kind).toBe('unlocked');

    answerLevel(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
    await settle();
    expect(lock().kind).toBe('unlocked');
  });

  it('does not wipe out a failure with a late answer, which would prompt in a loop', async () => {
    await unlockedWithLock();
    let answerLevel = (_level: number) => undefined as void;
    enrolled.mockReturnValueOnce(new Promise((resolve) => (answerLevel = resolve)));
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS);

    authenticate.mockResolvedValue({ success: false, error: 'user_cancel' });
    await unlock();
    expect(lock()).toMatchObject({ kind: 'locked', failure: 'cancelled' });

    answerLevel(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
    await settle();
    expect(lock()).toMatchObject({ kind: 'locked', failure: 'cancelled' });
  });

  it('does not lock on inactive alone, which is what the prompt itself causes', async () => {
    await unlockedWithLock();
    handleAppState('inactive', start);
    handleAppState('active', start + RELOCK_AFTER_MS * 2);
    await settle();
    expect(lock().kind).toBe('unlocked');
  });

  it('does not loop when the prompt itself backgrounds the app', async () => {
    await unlockedWithLock();
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS);
    await settle();

    // Android's passcode screen is a separate activity, so the app really does background.
    authenticate.mockImplementation(async () => {
      handleAppState('background', start + 1000);
      return { success: true };
    });
    await unlock();
    handleAppState('active', start + RELOCK_AFTER_MS * 3);
    await settle();
    expect(lock().kind).toBe('unlocked');
  });

  it('does not re-prompt someone who took a long time and cancelled', async () => {
    await unlockedWithLock();
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS);
    await settle();

    // The passcode screen is up for minutes, so the app sits in the background, then they cancel.
    authenticate.mockImplementation(async () => {
      handleAppState('background', start + 1000);
      return { success: false, error: 'user_cancel' };
    });
    await unlock();
    handleAppState('active', start + RELOCK_AFTER_MS * 4);
    await settle();

    // A fresh lock has failure: null, which prompts at once. That would never let them out.
    expect(lock()).toMatchObject({ kind: 'locked', failure: 'cancelled' });
  });

  it('never locks a user who has not turned it on', async () => {
    await bootApp();
    handleAppState('background', start);
    handleAppState('active', start + RELOCK_AFTER_MS * 10);
    await settle();
    expect(lock().kind).toBe('unlocked');
  });
});
