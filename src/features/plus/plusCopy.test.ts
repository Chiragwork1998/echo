import { plusCopy, trialLength } from './plusCopy';

// ECHO launches on Android: the brief's words name Google Play.
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

describe('the paywall’s words', () => {
  it('are the brief’s, verbatim, on Android', () => {
    expect(plusCopy.heading).toBe('ECHO Plus');
    expect(plusCopy.lead).toBe('The whole practice, with nothing held back.');
    expect(plusCopy.benefits.map((benefit) => benefit.line)).toEqual([
      'ECHO reads your entries and names what keeps returning, in your own words.',
      'Speak for as long as you need. Free includes 60 minutes a month.',
      'Focus and Sleep, any length, and Steady at your own pace.',
      'Watch your words arrive as you speak, or have them tidied.',
    ]);
    expect(plusCopy.finePrint).toBe(
      'Cancel anytime in Google Play. You won’t be charged until the trial ends, and ECHO will remind you two days before.',
    );
    expect([plusCopy.restore, plusCopy.terms, plusCopy.privacy, plusCopy.notNow]).toEqual([
      'Restore purchases',
      'Terms',
      'Privacy',
      'Not now',
    ]);
  });

  it('build each plan’s line around the store’s own price', () => {
    const week = { unit: 'week', count: 1 } as const;
    expect(plusCopy.planLine('year', '₹1,999.00', week)).toBe('7 days free, then ₹1,999.00 a year');
    expect(plusCopy.planLine('month', '₹299.00', null)).toBe('₹299.00 a month');
    expect(plusCopy.start(week)).toBe('Start 7 days free');
    expect(plusCopy.continue).toBe('Continue');
  });

  it('say a trial’s length the way people do', () => {
    expect(trialLength({ unit: 'day', count: 7 })).toBe('7 days');
    expect(trialLength({ unit: 'week', count: 2 })).toBe('14 days');
    expect(trialLength({ unit: 'day', count: 1 })).toBe('1 day');
    expect(trialLength({ unit: 'month', count: 1 })).toBe('1 month');
    expect(trialLength({ unit: 'month', count: 3 })).toBe('3 months');
    expect(trialLength({ unit: 'year', count: 1 })).toBe('1 year');
  });

  it('never write a price, an exclamation mark, or a word about AI', () => {
    const everything = JSON.stringify(plusCopy);
    expect(everything).not.toMatch(/[₹$€£]\s?\d/);
    expect(everything).not.toMatch(/!/);
    expect(everything).not.toMatch(/\b(AI|magic|insights|smart|unlock|journey|seamless)\b/i);
  });
});
