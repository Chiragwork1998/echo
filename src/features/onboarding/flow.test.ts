import { backPath, nextPath, onboardingSteps, pathOf } from './flow';

describe('onboarding flow', () => {
  it('has exactly eight steps in the locked order', () => {
    expect(onboardingSteps).toEqual([
      'intent',
      'horizon',
      'voice',
      'rhythm',
      'privacy',
      'arrival',
      'first-echo',
      'completion',
    ]);
  });

  it('resolves neighbours from the handoff navigation map', () => {
    expect(pathOf('landing')).toBe('/');
    expect(nextPath('landing')).toBe('/onboarding/intent');
    expect(backPath('horizon')).toBe('/onboarding/intent');
    expect(nextPath('completion')).toBe('/home');
  });

  it('never allows back from completion', () => {
    expect(backPath('completion')).toBeUndefined();
  });
});
