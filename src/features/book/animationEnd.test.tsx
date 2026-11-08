// What the book waits on when it waits for an animation. A net is for a UI thread that has stopped; it is
// set from the animation's first frame on the UI thread, and never from when JS asked for it.
import { act, renderHook } from '@testing-library/react-native';

import { animationClock } from '@/testing/reanimatedMock';

import { netAfterBegin, useUiBegun, watchAnimation } from './animationEnd';
import { ANIMATION_NET_MS, UI_HANG_MS } from './ritual';

jest.mock(
  'react-native-reanimated',
  () => jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
);

beforeEach(() => {
  animationClock.reset();
  jest.useFakeTimers();
});
afterEach(() => {
  animationClock.reset();
  jest.useRealTimers();
});
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

describe('watching an animation', () => {
  it('says it is over once, when the animation says so, and clears every net', () => {
    const end = jest.fn();
    const watch = watchAnimation(1000, end);
    watch.began();
    watch.ended();
    watch.ended();
    jest.advanceTimersByTime(UI_HANG_MS * 3);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('is let go of a net after it began, counted from its first frame and not from the ask', () => {
    const end = jest.fn();
    const watch = watchAnimation(1000, end);
    jest.advanceTimersByTime(2000);
    watch.began();
    jest.advanceTimersByTime(netAfterBegin(1000) - 1);
    expect(end).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('is not cut by an animation clock that runs at 0.4 of the wall clock, from the full opening to a leaf', () => {
    // The web build is held to this: every animation takes 2.5 times as long, and the nets, which are
    // JS timers on the wall clock, must still be later than the end of the motion they guard.
    for (const duration of [2600, 1620, 840, 700, 520, 320, 300]) {
      expect(netAfterBegin(duration)).toBeGreaterThan(duration / 0.4 + 1000);
    }
  });

  it('is let go of only UI_HANG_MS after it was due when the UI thread never begins it', () => {
    const end = jest.fn();
    watchAnimation(1000, end);
    jest.advanceTimersByTime(1000 + ANIMATION_NET_MS + 5000);
    expect(end).not.toHaveBeenCalled();
    jest.advanceTimersByTime(UI_HANG_MS - ANIMATION_NET_MS - 5000 - 1);
    expect(end).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('says nothing once a run is cancelled, whatever the animation it replaced reports', () => {
    const end = jest.fn();
    const watch = watchAnimation(1000, end);
    watch.cancel();
    watch.began();
    watch.ended();
    jest.advanceTimersByTime(UI_HANG_MS * 3);
    expect(end).not.toHaveBeenCalled();
  });
});

describe('the UI thread beginning what it was handed', () => {
  it('is heard when the UI thread has run it, however late that is, and not before', async () => {
    animationClock.lag = 2000;
    const { result } = await renderHook(() => useUiBegun());
    const then = jest.fn();
    result.current(then);
    await tick(2000);
    expect(then).not.toHaveBeenCalled();
    await tick(1);
    expect(then).toHaveBeenCalledTimes(1);
  });

  it('does not tell one that a later one replaced', async () => {
    animationClock.lag = 500;
    const { result } = await renderHook(() => useUiBegun());
    const first = jest.fn();
    const second = jest.fn();
    result.current(first);
    await tick(100);
    result.current(second);
    await tick(2000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
