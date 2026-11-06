import { create } from 'zustand';

import { DecryptionError } from '@/storage/envelope';

// Choices made during onboarding. Screens read and update this store directly. Once the root gate has
// hydrated it, every change is persisted through the encrypted storage layer, because intent and
// mood are personal data. Until then it is memory only, which is what Jest and web run on.
export type Intent = 'quiet' | 'understand_self' | 'hold_moments' | 'direction';
export type Horizon = 'past' | 'present' | 'future';
export type Mode = 'guide' | 'space' | 'speak';
export type Mood = 'light' | 'steady' | 'unsettled' | 'heavy' | 'numb';
export type ReminderPreset = 'morning' | 'evening' | 'before_sleep';

export type OnboardingState = {
  intent?: Intent;
  horizon?: Horizon;
  mode?: Mode;
  mood?: Mood;
  reminder: { time: string; enabled: boolean; preset?: ReminderPreset };
  privacy: { biometricLock: boolean; privateBackup: boolean };
  /** 0 is Landing, 1 to 8 are the onboarding steps. The root layout keeps this current. */
  step: number;
  /** Set once by completeOnboarding. Never cleared, except by delete-all. */
  completedAt?: number;
};

export const initialOnboarding: OnboardingState = {
  reminder: { time: '21:30', enabled: false },
  privacy: { biometricLock: false, privateBackup: false },
  step: 0,
};

/** Reads and writes the sealed onboarding record. See createOnboardingPersistence. */
export type OnboardingPersistence = {
  load(): Promise<OnboardingState | null>;
  save(state: OnboardingState): Promise<void>;
};

type Meta = {
  /** The last save failed. Choices are still held in memory and the next change retries. */
  saveFailed: boolean;
};

type Actions = { update: (patch: Partial<OnboardingState>) => void };

export const useOnboarding = create<OnboardingState & Meta & Actions>((set) => ({
  ...initialOnboarding,
  saveFailed: false,
  update: (patch) => {
    set(patch);
    persist();
  },
}));

const snapshot = (): OnboardingState => {
  const { intent, horizon, mode, mood, reminder, privacy, step, completedAt } =
    useOnboarding.getState();
  return { intent, horizon, mode, mood, reminder, privacy, step, completedAt };
};

let persistence: OnboardingPersistence | null = null;
let dirty = false;
let draining: Promise<boolean> | null = null;

function drain(port: OnboardingPersistence): Promise<boolean> {
  draining ??= (async () => {
    try {
      // Newest state each pass, so a burst of updates collapses and order cannot be lost.
      while (dirty) {
        dirty = false;
        await port.save(snapshot());
      }
      useOnboarding.setState({ saveFailed: false });
      return true;
    } catch {
      dirty = true;
      useOnboarding.setState({ saveFailed: true });
      return false;
    } finally {
      draining = null;
    }
  })();
  return draining;
}

function persist(): void {
  if (!persistence) return;
  dirty = true;
  void drain(persistence);
}

/** Resolves true once everything is on disk. Always true where nothing persists (web, tests). */
export async function flushOnboarding(): Promise<boolean> {
  if (!persistence) return true;
  await draining;
  return dirty ? drain(persistence) : true;
}

export type HydrationResult =
  /** Stored choices were restored. */
  | 'restored'
  /** Nothing stored: first launch. */
  | 'fresh'
  /** The stored record failed to decrypt or parse, so onboarding starts again. */
  | 'reset';

/**
 * Loads saved choices, then turns persistence on. In that order: if saving were live first, the
 * initial state could overwrite a real record.
 */
export async function hydrateOnboarding(port: OnboardingPersistence): Promise<HydrationResult> {
  persistence = null;
  dirty = false;
  let stored: OnboardingState | null;
  let result: HydrationResult;
  try {
    stored = await port.load();
    result = stored ? 'restored' : 'fresh';
  } catch (error) {
    // Only a record that really cannot be read may be replaced. Any other failure could pass, and
    // carrying on with defaults would let the next change overwrite good data.
    if (!(error instanceof DecryptionError)) throw error;
    stored = null;
    result = 'reset';
  }
  useOnboarding.setState({ ...initialOnboarding, ...stored, saveFailed: false });
  persistence = port;
  return result;
}

/** Records the step the user is on. The root layout calls this as the route changes. */
export function setOnboardingStep(step: number): void {
  const state = useOnboarding.getState();
  if (state.completedAt === undefined && state.step !== step) state.update({ step });
}

export const ONBOARDING_LAST_STEP = 8;

/**
 * Finishes onboarding and waits until that is on disk. Call it from Enter your space, after the
 * first entry is committed. On false, show the error and let the user retry.
 */
export async function completeOnboarding(now: number = Date.now()): Promise<boolean> {
  const { completedAt, update } = useOnboarding.getState();
  if (completedAt !== undefined) return flushOnboarding();
  update({ completedAt: now, step: ONBOARDING_LAST_STEP });
  const saved = await flushOnboarding();
  if (!saved) useOnboarding.setState({ completedAt: undefined });
  return saved;
}

// setState merges, so optional fields have to be cleared by name.
const CLEARED: Partial<OnboardingState> = {
  intent: undefined,
  horizon: undefined,
  mode: undefined,
  mood: undefined,
  completedAt: undefined,
};

export function resetOnboarding(): void {
  persistence = null;
  dirty = false;
  useOnboarding.setState({ ...initialOnboarding, ...CLEARED, saveFailed: false });
}
