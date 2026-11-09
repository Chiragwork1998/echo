import { runningCode, updateLabel } from './appUpdate';

describe('the code the app is running', () => {
  it('is the code it was installed with when there is no updater, or the launch was the built-in one', () => {
    expect(runningCode(null)).toEqual({ kind: 'installed' });
    expect(runningCode({ isEmbeddedLaunch: true, createdAt: null })).toEqual({ kind: 'installed' });
  });

  it('is an update when one came over the air, with when it was made', () => {
    const made = new Date(2026, 10, 9, 14, 5);
    expect(runningCode({ isEmbeddedLaunch: false, createdAt: made })).toEqual({
      kind: 'update',
      createdAt: made,
    });
  });
});

describe('when an update was made, as You says it', () => {
  it('is the day and the time, in the phone’s own time', () => {
    expect(updateLabel(new Date(2026, 10, 9, 14, 5))).toBe('9 Nov, 2:05 pm');
    expect(updateLabel(new Date(2026, 10, 9, 9, 30))).toBe('9 Nov, 9:30 am');
  });

  it('says nothing it does not know', () => {
    expect(updateLabel(null)).toBeNull();
    expect(updateLabel(new Date(Number.NaN))).toBeNull();
  });
});
