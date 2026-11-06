import { create } from 'zustand';

// Choices made during onboarding. In memory for now: persistence goes through the encrypted
// storage layer (see docs/SCREEN_AGENT_BRIEF.md) because intent and mood are personal data.
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
};

export const initialOnboarding: OnboardingState = {
  reminder: { time: '21:30', enabled: false },
  privacy: { biometricLock: false, privateBackup: false },
};

type Actions = { update: (patch: Partial<OnboardingState>) => void };

export const useOnboarding = create<OnboardingState & Actions>((set) => ({
  ...initialOnboarding,
  update: (patch) => set(patch),
}));
