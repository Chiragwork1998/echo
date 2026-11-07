import { decideRoute, pathForStep, resumePath, stepForPath } from './routing';

describe('steps and paths', () => {
  it('maps every step to its route and back', () => {
    const expected = [
      '/',
      '/onboarding/intent',
      '/onboarding/horizon',
      '/onboarding/voice',
      '/onboarding/rhythm',
      '/onboarding/privacy',
      '/onboarding/arrival',
      '/onboarding/first-echo',
      '/onboarding/completion',
    ];
    expected.forEach((path, step) => {
      expect(pathForStep(step)).toBe(path);
      expect(stepForPath(path)).toBe(step);
    });
  });

  it('has no step for screens outside onboarding', () => {
    expect(stepForPath('/home')).toBeNull();
    expect(stepForPath('/home/echoes')).toBeNull();
  });

  it('falls back to Landing for a step it does not know', () => {
    expect(pathForStep(99)).toBe('/');
  });
});

describe('resumePath', () => {
  it('sends completed users Home', () => {
    expect(resumePath({ step: 8, completedAt: 1 }, true)).toBe('/home');
  });

  it('returns others to where they were', () => {
    expect(resumePath({ step: 0 }, false)).toBe('/');
    expect(resumePath({ step: 4 }, false)).toBe('/onboarding/rhythm');
    expect(resumePath({ step: 7 }, false)).toBe('/onboarding/first-echo');
    expect(resumePath({ step: 8 }, true)).toBe('/onboarding/completion');
  });

  it('moves past First Echo if the entry committed just before the app died', () => {
    expect(resumePath({ step: 7 }, true)).toBe('/onboarding/completion');
  });
});

describe('decideRoute', () => {
  const base = { completed: false, step: 3, resume: '/onboarding/voice', initial: false };

  it('takes an unfinished user to their step on launch', () => {
    expect(decideRoute({ ...base, pathname: '/', initial: true })).toEqual({
      action: 'replace',
      path: '/onboarding/voice',
    });
  });

  it('stays once there', () => {
    expect(decideRoute({ ...base, pathname: '/onboarding/voice', initial: true })).toEqual({
      action: 'stay',
    });
  });

  it('takes a finished user Home on launch', () => {
    expect(
      decideRoute({ ...base, completed: true, resume: '/home', pathname: '/', initial: true }),
    ).toEqual({ action: 'replace', path: '/home' });
  });

  it('keeps a finished user out of onboarding, as with the system back button', () => {
    expect(decideRoute({ ...base, completed: true, pathname: '/onboarding/first-echo' })).toEqual({
      action: 'replace',
      path: '/home',
    });
  });

  it('leaves a finished user anywhere in Home', () => {
    expect(decideRoute({ ...base, completed: true, pathname: '/home/echoes' })).toEqual({
      action: 'stay',
    });
  });

  it('keeps an unfinished user out of Home, as with a deep link', () => {
    expect(decideRoute({ ...base, pathname: '/home' })).toEqual({
      action: 'replace',
      path: '/onboarding/voice',
    });
  });

  it('finishes onboarding if Completion moved on to Home by itself', () => {
    expect(decideRoute({ ...base, step: 8, pathname: '/home' })).toEqual({ action: 'complete' });
  });

  it('lets normal navigation through the flow alone', () => {
    expect(decideRoute({ ...base, pathname: '/onboarding/rhythm' })).toEqual({ action: 'stay' });
    expect(decideRoute({ ...base, pathname: '/' })).toEqual({ action: 'stay' });
  });
});

describe('decideRoute and the ECHO Plus offer', () => {
  const done = { completed: true, step: 8, resume: '/home', initial: false };
  const completion = '/onboarding/completion';

  it('shows the offer once as Completion finishes, in place of Home', () => {
    expect(decideRoute({ ...done, pathname: completion, offerPlus: true })).toEqual({
      action: 'replace',
      path: '/plus?from=onboarding',
    });
  });

  it('goes straight Home once it has been seen, or where there is nothing to offer', () => {
    expect(decideRoute({ ...done, pathname: completion, offerPlus: false })).toEqual({
      action: 'replace',
      path: '/home',
    });
    expect(decideRoute({ ...done, pathname: completion })).toEqual({
      action: 'replace',
      path: '/home',
    });
  });

  it('never shows it on a relaunch or from the back button, only from Completion', () => {
    expect(decideRoute({ ...done, pathname: '/', initial: true, offerPlus: true })).toEqual({
      action: 'replace',
      path: '/home',
    });
    expect(decideRoute({ ...done, pathname: '/onboarding/first-echo', offerPlus: true })).toEqual({
      action: 'replace',
      path: '/home',
    });
  });

  it('leaves a finished user on the paywall', () => {
    expect(decideRoute({ ...done, pathname: '/plus' })).toEqual({ action: 'stay' });
    expect(decideRoute({ ...done, pathname: '/plus', offerPlus: true })).toEqual({
      action: 'stay',
    });
  });

  it('keeps someone still in onboarding off the paywall, as with a deep link', () => {
    const base = { completed: false, step: 3, resume: '/onboarding/voice', initial: true };
    expect(decideRoute({ ...base, pathname: '/plus', offerPlus: true })).toEqual({
      action: 'replace',
      path: '/onboarding/voice',
    });
  });
});
