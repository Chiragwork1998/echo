// The shelf's small manners: it does not pop when a finger touches or lets go, and a volume chosen and
// then left is not opened on the screen that is going. The stand-in for Reanimated resolves every
// animation to its end at once, so this proves what was asked for and when, never the curve. Its own
// clock says when an animation has finished, and a phone that is behind it is a `lag`.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';

import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { ANIMATION_NET_MS, UI_HANG_MS } from './ritual';
import { netAfterBegin } from './animationEnd';
import { CHOOSE_AT_MS, Shelf, useShelfOffset } from './Shelf';
import { VOLUMES } from './volumes';

jest.mock('react-native-reanimated', () => {
  const stand = jest.requireActual('@/testing/reanimatedMock').reanimatedMock;
  return { ...stand, withTiming: jest.fn(stand.withTiming) };
});
let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));
jest.mock('@/features/journal-session/useScreenReader', () => ({ useScreenReader: () => false }));

const ROLL_MS = 3200;
const OUT_MS = 320;
const YOUR_ECHO = VOLUMES.findIndex((volume) => volume.id === 'your-echo');
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const timings = () =>
  jest.mocked(withTiming).mock.calls.map(([to, config]) => ({
    to,
    duration: (config as { duration?: number } | undefined)?.duration,
  }));

function Row({ onChoose, onLeft }: { onChoose: (index: number) => void; onLeft?: () => void }) {
  const offset = useShelfOffset();
  return <Shelf initial={YOUR_ECHO} offset={offset} onChoose={onChoose} onLeft={onLeft} />;
}

/** A finger going down on the shelf, as PanResponder reads it. */
const touch = (x: number) => ({
  touchHistory: {
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 1,
    numberActiveTouches: 1,
    touchBank: [
      {
        touchActive: true,
        startPageX: x,
        startPageY: 100,
        currentPageX: x,
        currentPageY: 100,
        previousPageX: x,
        previousPageY: 100,
        startTimeStamp: 1,
        currentTimeStamp: 1,
        previousTimeStamp: 1,
      },
    ],
  },
});

beforeEach(() => {
  mockReduced = false;
  animationClock.reset();
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  animationClock.reset();
  jest.useRealTimers();
});

describe('choosing a volume', () => {
  it('asks for the book while the shelf is still leaving, and only once', async () => {
    const onChoose = jest.fn();
    await render(<Row onChoose={onChoose} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(CHOOSE_AT_MS - 1);
    expect(onChoose).not.toHaveBeenCalled();
    await tick(1);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(YOUR_ECHO);
    // The book is asked for well before the shelf has gone, so that it is drawing as the shelf's last
    // light leaves: with neither, a slow phone shows the bare studio colour.
    expect(CHOOSE_AT_MS).toBeLessThan(OUT_MS / 2);
    await tick(1000);
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('says it has left when its own fade has ended, and not before', async () => {
    const onLeft = jest.fn();
    await render(<Row onChoose={jest.fn()} onLeft={onLeft} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(OUT_MS - 1);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(1);
    expect(onLeft).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('is there for as long as its fade takes on a phone that is behind the clock', async () => {
    animationClock.lag = 600;
    const onLeft = jest.fn();
    await render(<Row onChoose={jest.fn()} onLeft={onLeft} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(OUT_MS + 300);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(400);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('is there for as long as its fade takes on a phone whose UI thread begins it two seconds late', async () => {
    // The walk measured the UI thread beginning an animation 1.8 to 2.1 s after it was asked for. The
    // shelf must not be called gone at the ritual's length plus 1500 ms, a third of the way through.
    animationClock.lag = 2000;
    const onLeft = jest.fn();
    await render(<Row onChoose={jest.fn()} onLeft={onLeft} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(OUT_MS + 1500 + 100);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(2000 + OUT_MS - (OUT_MS + 1500 + 100) - 1);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(2);
    expect(onLeft).toHaveBeenCalledTimes(1);
    await tick(UI_HANG_MS * 2);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('is let go of, a net after it was due and no sooner, if its fade began and its end is never heard', async () => {
    animationClock.lag = 2000;
    animationClock.silent = true;
    const onLeft = jest.fn();
    await render(<Row onChoose={jest.fn()} onLeft={onLeft} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(2000 + netAfterBegin(OUT_MS) - 2);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(4);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('is let go of, a very long time after it was due, if its fade is never begun', async () => {
    animationClock.lag = 1_000_000;
    const onLeft = jest.fn();
    await render(<Row onChoose={jest.fn()} onLeft={onLeft} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(OUT_MS + 1500 + ANIMATION_NET_MS + 100);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(UI_HANG_MS - 1500 - ANIMATION_NET_MS - 100 - 1);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(1);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('fades as one picture, so the books and the plank do not show through each other', async () => {
    await render(<Row onChoose={jest.fn()} />);
    expect(screen.getByTestId('shelf-stage').props.needsOffscreenAlphaCompositing).toBe(true);
  });

  it('does not open it on a screen that has gone: Back as it is chosen takes it back', async () => {
    const onChoose = jest.fn();
    const onLeft = jest.fn();
    const view = await render(<Row onChoose={onChoose} onLeft={onLeft} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(CHOOSE_AT_MS / 2);
    await view.unmount();
    await tick(OUT_MS + UI_HANG_MS);
    expect(onChoose).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('under Reduce Motion opens it at once, with no exit to wait for', async () => {
    mockReduced = true;
    const onChoose = jest.fn();
    const onLeft = jest.fn();
    await render(<Row onChoose={onChoose} onLeft={onLeft} />);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });
});

describe('the hint, the halo and the lift', () => {
  it('come back over the time of a settle when a volume is brought to the centre, not in one frame', async () => {
    await render(<Row onChoose={jest.fn()} />);
    await tick(ROLL_MS);
    jest.clearAllMocks();
    await fireEvent.press(screen.getByTestId('volume-horizon'));
    expect(timings()).toContainEqual({ to: 1, duration: 320 });
  });

  it('come back in a fade of at most 180 ms under Reduce Motion', async () => {
    mockReduced = true;
    await render(<Row onChoose={jest.fn()} />);
    jest.clearAllMocks();
    await fireEvent.press(screen.getByTestId('volume-horizon'));
    expect(timings()).toContainEqual({ to: 1, duration: 180 });
    expect(timings().every(({ duration }) => (duration ?? 0) <= 180)).toBe(true);
  });

  it('go in a short fade when a finger takes hold of the shelf, and do not vanish in one frame', async () => {
    await render(<Row onChoose={jest.fn()} />);
    await tick(ROLL_MS);
    jest.clearAllMocks();
    // The shelf is a PanResponder, which only answers to a move: its grant is called as the system would.
    const grant = screen.getByTestId('book-shelf').props.onResponderGrant as (
      event: object,
    ) => void;
    await act(() => grant(touch(100)));
    expect(timings()).toContainEqual({ to: 0, duration: 180 });
  });
});
