import type { OnboardingState } from '@/state/onboarding';

// Screen state shown in each golden, seeded only by the visual harness.
export const goldenFixtures: Record<string, Partial<OnboardingState>> = {
  intent: { intent: 'understand_self' },
  horizon: { horizon: 'present' },
  voice: { mode: 'guide' },
  rhythm: { reminder: { time: '21:30', enabled: true, preset: 'before_sleep' } },
  privacy: { privacy: { biometricLock: true, privateBackup: true } },
  arrival: { mood: 'unsettled' },
};
