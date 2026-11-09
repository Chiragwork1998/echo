// The shelf's small manners: it does not pop when a finger touches or lets go, and a volume chosen and
// then left is not opened on the screen that is going. The stand-in for Reanimated resolves every
// animation to its end at once, so this proves what was asked for and when, never the curve. Its own
// clock says when an animation has finished, and a phone that is behind it is a `lag`.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';

import { ThemeProvider } from '@/design/theme';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { ANIMATION_NET_MS, UI_HANG_MS } from './ritual';
import { netAfterBegin } from './animationEnd';
import { CHOOSE_AT_MS, SHELF_FINISH_MS, SHELF_HELD, Shelf, useShelfOffset } from './Shelf';
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

function Row({
  onChoose,
  onLeft,
  holding = false,
}: {
  onChoose: (index: number) => void;
  onLeft?: () => void;
  holding?: boolean;
}) {
  const offset = useShelfOffset();
  return (
    <Shelf
      initial={YOUR_ECHO}
      offset={offset}
      onChoose={onChoose}
      onLeft={onLeft}
      holding={holding}
    />
  );
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

describe('a volume chosen while the book has not yet drawn', () => {
  // The walked emulator mounted the book for half a second after the choice, while the shelf's own fade, on the
  // UI thread, ran to nothing: an empty navy frame, 0.51 s of it, between the shelf's last light and the book's
  // first. The shelf is kept, part of the way gone, until the book says it has drawn (./BookStage onDrawn).
  const choose = async (props: {
    holding: boolean;
    onLeft?: () => void;
    onChoose?: () => void;
  }) => {
    const element = (holding: boolean) => (
      <Row onChoose={props.onChoose ?? jest.fn()} onLeft={props.onLeft} holding={holding} />
    );
    const view = await render(element(props.holding));
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    jest.mocked(withTiming).mockClear();
    return {
      view,
      again: (holding: boolean) =>
        view.rerender(<ThemeProvider crossfade={false}>{element(holding)}</ThemeProvider>),
    };
  };

  it('is held, partly faded and not gone, for as long as the book has not drawn', async () => {
    const onLeft = jest.fn();
    const onChoose = jest.fn();
    await choose({ holding: true, onLeft, onChoose });
    // The book is asked for as ever.
    await tick(CHOOSE_AT_MS);
    expect(onChoose).toHaveBeenCalledTimes(1);
    // The shelf's fade, which took 320 ms and ended in nothing, goes only part of the way and stops.
    await tick(OUT_MS * 20);
    expect(onLeft).not.toHaveBeenCalled();
    expect(screen.getByTestId('shelf-stage')).toBeTruthy();
    expect(SHELF_HELD).toBeGreaterThan(0.3);
    expect(SHELF_HELD).toBeLessThan(0.8);
  });

  it('goes the rest of the way when the book has drawn, and has left when that has ended', async () => {
    const onLeft = jest.fn();
    const { again } = await choose({ holding: true, onLeft });
    await tick(5000);
    expect(onLeft).not.toHaveBeenCalled();
    await again(false);
    await tick(SHELF_FINISH_MS - 1);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(1);
    expect(onLeft).toHaveBeenCalledTimes(1);
    await tick(UI_HANG_MS * 2);
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(timings()).toContainEqual({ to: 1, duration: SHELF_FINISH_MS });
  });

  it('goes on at once when the book has drawn before the shelf’s own first fade is over', async () => {
    const onLeft = jest.fn();
    const { again } = await choose({ holding: true, onLeft });
    await tick(40);
    await again(false);
    await tick(SHELF_FINISH_MS);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('has left only when its last fade has really ended, on a phone that is behind the clock', async () => {
    const onLeft = jest.fn();
    const { again } = await choose({ holding: true, onLeft });
    await tick(3000);
    animationClock.lag = 800;
    await again(false);
    await tick(SHELF_FINISH_MS + 400);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(500);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('is let go of, a very long time after, if the book never draws', async () => {
    const onLeft = jest.fn();
    await choose({ holding: true, onLeft });
    await tick(UI_HANG_MS - 1);
    expect(onLeft).not.toHaveBeenCalled();
    await tick(SHELF_FINISH_MS + 2);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('takes no more touches once it is chosen: a held shelf must not stand between a finger and the page', async () => {
    await choose({ holding: true });
    expect(screen.getByTestId('shelf-stage').props.pointerEvents).toBe('none');
  });

  it('does not hold a shelf that was chosen with no book to wait for', async () => {
    const onLeft = jest.fn();
    await choose({ holding: false, onLeft });
    await tick(OUT_MS);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('is not left behind on a screen that has gone: Back while it is held takes it all back', async () => {
    const onLeft = jest.fn();
    const { view } = await choose({ holding: true, onLeft });
    await view.unmount();
    await tick(UI_HANG_MS * 2);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('under Reduce Motion asks for the book at once, and keeps the whole shelf until the book has drawn', async () => {
    mockReduced = true;
    const onLeft = jest.fn();
    const onChoose = jest.fn();
    const element = (holding: boolean) => (
      <Row onChoose={onChoose} onLeft={onLeft} holding={holding} />
    );
    const view = await render(element(true));
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    expect(onChoose).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(onLeft).not.toHaveBeenCalled();
    await view.rerender(<ThemeProvider crossfade={false}>{element(false)}</ThemeProvider>);
    await tick(180);
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
