import { Platform } from 'react-native';
import { create } from 'zustand';

import { noteLostRecordings } from '@/features/journal/api';
import { sqlJournalFor } from '@/features/journal/runtime';
import {
  authenticate,
  getLockMethod,
  type AuthFailure,
  type LockMethod,
} from '@/services/biometric';
import { hydratePlus } from '@/services/plus/store';
import { DatabaseTooNewError } from '@/storage/migrations';
import { getRuntime, type Runtime } from '@/storage/runtime';
import { qa } from '@/testing/qa';

import { completeOnboarding, hydrateOnboarding, useOnboarding } from './onboarding';
import { createOnboardingPersistence } from './onboardingStore';
import { hydratePreferences } from './preferences';
import { resumePath } from './routing';

/** The harness and the web preview have no storage: no gates, no hydration, memory only. */
export const gateBypassed = qa.enabled || Platform.OS === 'web';

/** Long enough to come back from a share sheet or a permission dialog without re-authenticating. */
export const RELOCK_AFTER_MS = 30_000;

export type GateStatus =
  | { kind: 'booting' }
  /** Safe to mount the navigator. `resume` is the route this launch resolved to. */
  | { kind: 'ready'; resume: string }
  /**
   * Encrypted data exists but cannot be opened. Nothing has been changed. Retry first: the key may
   * return (a device restore, say). Starting over is the only other way out and erases the data.
   */
  | { kind: 'key_lost'; reason: 'missing' | 'mismatch' }
  /** A fault that can pass, such as the device being locked. Retried on return to foreground. */
  | { kind: 'storage_error'; reason: 'secure_store' | 'database' | 'database_too_new' };

export type LockStatus =
  | { kind: 'unlocked' }
  | {
      kind: 'locked';
      method: LockMethod;
      failure: AuthFailure | null;
      /** Show Turn off lock. True only when no credential on this device could ever pass. */
      canDisable: boolean;
    };

type Gate = { status: GateStatus; lock: LockStatus };

export const useGate = create<Gate>(() => ({
  status: gateBypassed ? { kind: 'ready', resume: '/' } : { kind: 'booting' },
  lock: { kind: 'unlocked' },
}));

let booting: Promise<void> | null = null;
let authInFlight = false;
let backgroundedAt: number | null = null;
/** The last answer from the device. 'passcode' until then: it never offers a way out. */
let knownMethod: LockMethod = 'passcode';

async function lockState(failure: AuthFailure | null = null): Promise<LockStatus> {
  const method = await getLockMethod();
  knownMethod = method;
  return {
    kind: 'locked',
    method,
    failure,
    canDisable: method === 'none',
  };
}

/**
 * Locks now, in the caller's tick. The cover lifts in the same AppState event, and asking the device
 * what can unlock is a native round trip, so waiting for that would show content in between. Its
 * answer refines this lock, unless the prompt has already answered: applying it then would lock an
 * unlocked app, or clear a failure and re-prompt in a loop.
 */
function relock(): void {
  const lock: LockStatus = {
    kind: 'locked',
    method: knownMethod,
    failure: null,
    canDisable: false,
  };
  useGate.setState({ lock });
  void lockState().then((checked) => {
    if (useGate.getState().lock === lock) useGate.setState({ lock: checked });
  });
}

async function resolve(runtime: Runtime): Promise<void> {
  try {
    await hydratePreferences(runtime.db, runtime.serial);
  } catch {
    // Night is an acceptable theme. A missing preference is no reason to keep someone out.
  }

  try {
    // ECHO Plus as the last launch knew it, so an offline launch still knows it.
    await hydratePlus(runtime.db, runtime.serial);
  } catch {
    // The store's own answer arrives once it is reached. Nothing here keeps anyone out either.
  }

  try {
    // Ahead of the key, because a decrypted export needs none to remove, and the states below can
    // stop this launch before the sweep runs.
    runtime.files.removeDirectory(runtime.paths.tempDir);
  } catch {
    // The sweep tries again, and the next launch after that.
  }

  const vault = await runtime.vault.prepare();
  if (vault.state === 'key_missing' || vault.state === 'key_mismatch') {
    const reason = vault.state === 'key_missing' ? 'missing' : 'mismatch';
    useGate.setState({ status: { kind: 'key_lost', reason } });
    return;
  }
  if (vault.state === 'unavailable') {
    useGate.setState({ status: { kind: 'storage_error', reason: vault.reason } });
    return;
  }

  const journal = sqlJournalFor(runtime);
  // Before anything else, so plaintext is off disk as early as possible. Failures leave the file in
  // place for the next launch and never block the app.
  const swept = await journal.recoverLeftovers().catch(() => null);
  if (swept?.lost) noteLostRecordings(swept.lost);

  const hydration = await hydrateOnboarding(createOnboardingPersistence(runtime));
  const committed = await journal.hasCommittedEntries();
  const hasCommitted = committed.ok && committed.value;
  // Onboarding's own record was unreadable but entries exist, so this person finished long ago. They
  // should reach their journal, not be sent back through setup. This stays in memory, and the lock
  // below is on, because that record may have said so.
  if (hydration === 'reset' && hasCommitted) await completeOnboarding(runtime.now());

  const state = useOnboarding.getState();
  const lock = state.privacy.biometricLock ? await lockState() : ({ kind: 'unlocked' } as const);
  useGate.setState({
    status: { kind: 'ready', resume: resumePath(state, hasCommitted) },
    lock,
  });
}

async function run(): Promise<void> {
  useGate.setState({ status: { kind: 'booting' } });
  try {
    await resolve(await getRuntime());
  } catch (error) {
    const reason = error instanceof DatabaseTooNewError ? 'database_too_new' : 'database';
    useGate.setState({ status: { kind: 'storage_error', reason } });
  }
}

/** Resolves the gate. Also the retry for key_lost and storage_error. */
export function bootApp(): Promise<void> {
  if (gateBypassed) return Promise.resolve();
  booting ??= run().finally(() => {
    booting = null;
  });
  return booting;
}

/** Runs the OS prompt. Failure keeps the lock in place and reports why. */
export async function unlock(): Promise<void> {
  if (authInFlight) return;
  authInFlight = true;
  // The prompt itself takes the app out of the active state. Without this flag, finishing it would
  // look like returning from the background and lock again, forever.
  const outcome = await authenticate();
  authInFlight = false;
  if (outcome.ok) {
    backgroundedAt = null;
    useGate.setState({ lock: { kind: 'unlocked' } });
    return;
  }
  useGate.setState({ lock: await lockState(outcome.reason) });
}

/**
 * The way out for someone the lock can no longer admit, because the device has no credential left.
 * Refuses unless canDisable holds: a Turn off button that always worked would make the lock
 * decorative. No failed prompt ever earns it. A broken prompt keeps the journal shut and intact, and
 * Unlock stays available to retry.
 */
export async function disableLock(): Promise<boolean> {
  const { lock } = useGate.getState();
  if (lock.kind !== 'locked') return false;
  const current = await lockState(lock.failure);
  if (current.kind !== 'locked' || !current.canDisable) {
    useGate.setState({ lock: current });
    return false;
  }
  const { privacy, update } = useOnboarding.getState();
  update({ privacy: { ...privacy, biometricLock: false } });
  useGate.setState({ lock: { kind: 'unlocked' } });
  return true;
}

/** Called on every AppState change by the root layout. */
export function handleAppState(next: string, now: number = Date.now()): void {
  if (gateBypassed) return;
  const { status } = useGate.getState();
  if (next === 'active') {
    if (status.kind === 'storage_error' && status.reason === 'secure_store') void bootApp();
    const away = backgroundedAt === null ? 0 : now - backgroundedAt;
    backgroundedAt = null;
    // Negative means the clock moved back while away, so how long it really was is unknown.
    const expired = away < 0 || away >= RELOCK_AFTER_MS;
    if (expired && status.kind === 'ready' && useOnboarding.getState().privacy.biometricLock) {
      relock();
    }
  } else if (next === 'background' && !authInFlight) {
    backgroundedAt ??= now;
  }
}

export function resetGateForTests(): void {
  booting = null;
  authInFlight = false;
  backgroundedAt = null;
  knownMethod = 'passcode';
  useGate.setState({ status: { kind: 'booting' }, lock: { kind: 'unlocked' } });
}
