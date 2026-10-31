import { useEffect, useSyncExternalStore } from 'react';
import { AVATARS, type AvatarId } from '@/features/avatar/catalog';

import {
  defaultOnboardingPersistence,
  type OnboardingPersistence,
} from '@/storage/onboardingPersistence';

export type IntentSelection =
  | 'quiet_noise'
  | 'understand_self'
  | 'hold_moments'
  | 'find_direction';
export type HorizonSelection = 'behind_me' | 'where_i_am' | 'ahead_of_me';
export type VoiceSelection = 'guide_me' | 'give_me_space' | 'let_me_speak';
export type MoodSelection = 'light' | 'steady' | 'unsettled' | 'heavy' | 'numb';
export type ReminderPreset = 'morning' | 'evening' | 'before_sleep' | 'custom';
export type PermissionStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'unavailable';

/** Onboarding screen index from `data/navigation.json` (0 landing … 8 completion). */
export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ReminderState = {
  enabled: boolean;
  /** Local 24-hour time in `HH:MM`; always snapped to 5-minute increments. */
  localTime: string;
  preset: ReminderPreset;
  notificationPermission: PermissionStatus;
};

export type PrivacyState = {
  biometricLockEnabled: boolean;
  privateBackupEnabled: boolean;
  /** Anonymous local users only authenticate when private backup is enabled. */
  authenticated: boolean;
};

export type OnboardingSnapshot = {
  /** Idempotent handoff receipt; originals remain in the guest workspace. */
  guestTransfer?: { accountId: string; completed: boolean };
  step: OnboardingStep;
  themeSetting: 'day' | 'night' | 'automatic';
  avatarId: AvatarId;
  /** Where the companion was last dropped (top-left, points); null keeps its default spot. */
  companionPosition: { x: number; y: number } | null;
  patternsEnabled: boolean;
  intent: IntentSelection | null;
  horizon: HorizonSelection;
  mode: VoiceSelection;
  mood: MoodSelection | null;
  reminder: ReminderState;
  privacy: PrivacyState;
  completedAt: string | null;
  updatedAt: string | null;
};

/** Presets from `specs/SCREEN_SPECS.md` § 04 Rhythm. */
export const REMINDER_PRESETS: readonly {
  id: Exclude<ReminderPreset, 'custom'>;
  label: string;
  localTime: string;
}[] = [
  { id: 'morning', label: 'Morning', localTime: '08:00' },
  { id: 'evening', label: 'Evening', localTime: '18:30' },
  { id: 'before_sleep', label: 'Before sleep', localTime: '21:30' },
];

export const REMINDER_GRANULARITY_MINUTES = 5;

const initialState: OnboardingSnapshot = {
  step: 0,
  themeSetting: 'night',
  avatarId: 'codex',
  companionPosition: null,
  patternsEnabled: false,
  intent: null,
  horizon: 'where_i_am',
  mode: 'guide_me',
  mood: null,
  reminder: {
    enabled: false,
    localTime: '21:30',
    preset: 'before_sleep',
    notificationPermission: 'unknown',
  },
  privacy: {
    biometricLockEnabled: false,
    privateBackupEnabled: false,
    authenticated: false,
  },
  completedAt: null,
  updatedAt: null,
};

type Listener = () => void;

let snapshot: OnboardingSnapshot = initialState;
const listeners = new Set<Listener>();

let persistence: OnboardingPersistence = defaultOnboardingPersistence;
let restoreStarted: Promise<void> | null = null;
let restoreGeneration = 0;

function publish(next: Partial<OnboardingSnapshot>) {
  snapshot = { ...snapshot, ...next, updatedAt: new Date().toISOString() };
  listeners.forEach((listener) => listener());
  persistence.save(snapshot);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Wires a local store in front of onboarding progress. Only the onboarding
 * state machine travels through this port; journal text and audio never do
 * (see `src/storage/encryption.ts`).
 */
export function configureOnboardingPersistence(port: OnboardingPersistence): void {
  persistence = port;
  restoreGeneration += 1;
  snapshot = initialState;
  restoreStarted = null;
  listeners.forEach(listener => listener());
}

/** Whether progress survives an app restart on this platform. */
export function isOnboardingPersistencePersistent(): boolean {
  return persistence.persistent;
}

/** Resolves once queued onboarding writes are durable. */
export function flushOnboardingPersistence(): Promise<void> {
  return persistence.flush?.() ?? Promise.resolve();
}

/**
 * Restores onboarding progress so a terminated session resumes at its last
 * step. Safe to call from any screen; the work runs once per app launch.
 */
export function restoreOnboardingState(): Promise<void> {
  const generation = restoreGeneration;
  const source = persistence;
  restoreStarted ??= (async () => {
    const stored = await source.load();
    if (generation !== restoreGeneration) return;
    if (stored) {
      snapshot = {
        ...initialState,
        ...stored,
        avatarId: AVATARS.some(avatar => avatar.id === stored.avatarId) ? stored.avatarId : initialState.avatarId,
        companionPosition: Number.isFinite(stored.companionPosition?.x) && Number.isFinite(stored.companionPosition?.y) ? stored.companionPosition : null,
        privacy: { ...initialState.privacy, ...stored.privacy },
        reminder: { ...initialState.reminder, ...stored.reminder },
      };
      listeners.forEach((listener) => listener());
    }
  })().catch((error: unknown) => {
    // The root gate offers retry. Never open default settings after a failed
    // read: that could disable a saved lock or overwrite resumable progress.
    if (generation === restoreGeneration) restoreStarted = null;
    throw error;
  });
  return restoreStarted;
}

export function useOnboardingState<T>(selector: (state: OnboardingSnapshot) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(snapshot),
    () => selector(snapshot),
  );
}

/** Restores stored progress on mount; no-op once the launch restore settles. */
export function useOnboardingRestore(): void {
  useEffect(() => {
    // The root gate reports restoration errors before mounting route screens.
    void restoreOnboardingState().catch(() => undefined);
  }, []);
}

export function setCurrentStep(step: OnboardingStep): void {
  if (snapshot.step === step) {
    return;
  }
  publish({ step });
}

export function setThemeSetting(themeSetting: OnboardingSnapshot['themeSetting']): void { publish({ themeSetting }); }
export function setAvatarSelection(avatarId: AvatarId): void {
  if (AVATARS.some(avatar => avatar.id === avatarId)) publish({ avatarId });
}
export function setCompanionPosition(companionPosition: { x: number; y: number }): void { publish({ companionPosition }); }
export function setPatternsEnabled(patternsEnabled: boolean): void { publish({ patternsEnabled }); }

export function setIntentSelection(value: IntentSelection): void {
  publish({ intent: value });
}

export function setHorizonSelection(value: HorizonSelection): void {
  publish({ horizon: value });
}

export function setVoiceSelection(value: VoiceSelection): void {
  publish({ mode: value });
}

export function setArrivalMood(value: MoodSelection | null): void {
  publish({ mood: value });
}

export function setReminderTime(localTime: string, preset: ReminderPreset): void {
  publish({ reminder: { ...snapshot.reminder, localTime, preset } });
}

export function setReminderEnabled(enabled: boolean): void {
  publish({ reminder: { ...snapshot.reminder, enabled } });
}

export function setNotificationPermission(notificationPermission: PermissionStatus): void {
  publish({ reminder: { ...snapshot.reminder, notificationPermission } });
}

export function setBiometricLockEnabled(biometricLockEnabled: boolean): void {
  publish({ privacy: { ...snapshot.privacy, biometricLockEnabled } });
}

export function setPrivateBackupEnabled(privateBackupEnabled: boolean): void {
  publish({ privacy: { ...snapshot.privacy, privateBackupEnabled } });
}

export function setAuthenticated(authenticated: boolean): void {
  publish({ privacy: { ...snapshot.privacy, authenticated } });
}

export function markOnboardingComplete(): void {
  publish({ completedAt: new Date().toISOString(), step: 8 });
}

export function resetOnboarding(): void {
  snapshot = initialState;
  listeners.forEach((listener) => listener());
  persistence.save(snapshot);
}

export function getOnboardingSelections(): Readonly<OnboardingSnapshot> {
  return snapshot;
}

/**
 * Resume target for the last step the user reached, or null when onboarding has
 * not started. Used by the onboarding gate so a terminated session continues
 * where it stopped instead of restarting at step 1.
 */
export function resolveResumeRoute(state: OnboardingSnapshot): string | null {
  switch (state.step) {
    case 0:
      return null;
    case 1:
      return '/onboarding/intent';
    case 2:
      return '/onboarding/horizon';
    case 3:
      return '/onboarding/voice';
    case 4:
      return '/onboarding/rhythm';
    case 5:
      return '/onboarding/privacy';
    case 6:
      return '/onboarding/arrival';
    case 7:
      return '/onboarding/first-echo';
    case 8:
      return state.completedAt ? '/home' : '/onboarding/completion';
    default:
      return null;
  }
}
