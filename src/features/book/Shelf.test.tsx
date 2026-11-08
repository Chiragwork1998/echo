// The shelf's small manners: it does not pop when a finger touches or lets go, and a volume chosen and
// then left is not opened on the screen that is going. The stand-in for Reanimated resolves every
// animation to its end at once, so this proves what was asked for and when, never the curve.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';

import { render } from '@/testing/render';

import { Shelf, useShelfOffset } from './Shelf';
import { VOLUMES } from './volumes';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  withTiming: jest.fn((value: unknown) => value),
}));
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

function Row({ onChoose }: { onChoose: (index: number) => void }) {
  const offset = useShelfOffset();
  return <Shelf initial={YOUR_ECHO} offset={offset} onChoose={onChoose} />;
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
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('choosing a volume', () => {
  it('opens it once the shelf has left, and only once', async () => {
    const onChoose = jest.fn();
    await render(<Row onChoose={onChoose} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(OUT_MS - 1);
    expect(onChoose).not.toHaveBeenCalled();
    await tick(1);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(YOUR_ECHO);
    await tick(1000);
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('does not open it on a screen that has gone: Back within the exit takes it back', async () => {
    const onChoose = jest.fn();
    const view = await render(<Row onChoose={onChoose} />);
    await tick(ROLL_MS);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    await tick(OUT_MS / 2);
    await view.unmount();
    await tick(OUT_MS);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('under Reduce Motion opens it at once, with no exit to wait for', async () => {
    mockReduced = true;
    const onChoose = jest.fn();
    await render(<Row onChoose={onChoose} />);
    await fireEvent.press(screen.getByTestId('volume-your-echo'));
    expect(onChoose).toHaveBeenCalledTimes(1);
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
