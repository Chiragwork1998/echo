import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as LocalAuthentication from 'expo-local-authentication';

import { emptyContent } from '@/features/journal/content';
import { sqlJournalFor } from '@/features/journal/runtime';
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

  it('gives a way out after the OS prompt keeps failing', async () => {
    await lockedDevice();
    authenticate.mockResolvedValue({ success: false, error: 'unknown' });
    await unlock();
    await unlock();
    expect(lock()).toMatchObject({ canDisable: false });
    await unlock();
    expect(lock()).toMatchObject({ canDisable: true, failure: 'system' });
    expect(await disableLock()).toBe(true);
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
