import { rampVolume, type BreathPlayer } from './audio';

/** A player's volume, which is all a ramp touches. */
const playerAt = (volume: number) => ({ volume }) as unknown as BreathPlayer;

describe('a volume ramp', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ends on time when the phone is busy and every step runs late', () => {
    const loop = playerAt(1);
    const then = jest.fn();
    rampVolume(loop, 0, 1200, then);
    // Every step lands 19 ms after it was due: 44 ms apart, as the v5 walk measured on Android.
    const lateStep = () => {
      jest.setSystemTime(Date.now() + 19);
      jest.advanceTimersByTime(25);
    };
    for (let step = 0; step < 27; step += 1) lateStep(); // 1188 ms
    expect(then).not.toHaveBeenCalled();
    expect(loop.volume).toBeCloseTo(1 - 1188 / 1200, 5);

    lateStep(); // 1232 ms: a step-counting ramp would be at 28 of its 48 steps.
    expect(loop.volume).toBe(0);
    expect(then).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2000);
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('moves evenly when its steps land on time', () => {
    const loop = playerAt(0);
    rampVolume(loop, 1, 400);
    jest.advanceTimersByTime(100);
    expect(loop.volume).toBeCloseTo(0.25, 5);
    jest.advanceTimersByTime(300);
    expect(loop.volume).toBe(1);
  });

  it('stays where it is once cut short', () => {
    const loop = playerAt(1);
    const then = jest.fn();
    const stop = rampVolume(loop, 0, 1000, then);
    jest.advanceTimersByTime(500);
    stop();
    jest.advanceTimersByTime(1000);
    expect(loop.volume).toBeCloseTo(0.5, 5);
    expect(then).not.toHaveBeenCalled();
  });
});
