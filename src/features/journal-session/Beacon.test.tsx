// The recording light is the only mark on the sky while someone speaks. It takes up its breath and
// lets it go, and it glides when it has to move; it never snaps. The stand-in for Reanimated records
// how each ramp was asked for, so these prove the ramps, the linger and the glide. Smoothness itself
// is judged on a device.
import { screen } from '@testing-library/react-native';
import { act } from 'react';
import { StyleSheet } from 'react-native';
import { cancelAnimation, withDelay, withRepeat, withTiming } from 'react-native-reanimated';

import { tokens } from '@/design/tokens';
import { ThemeProvider } from '@/design/theme';
import { render } from '@/testing/render';

import { Beacon } from './Beacon';
import { LIGHT } from './sky';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  withTiming: jest.fn((value: unknown) => value),
  withRepeat: jest.fn((value: unknown) => value),
  withDelay: jest.fn((_delay: number, value: unknown) => value),
  cancelAnimation: jest.fn(),
}));
let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

const light = (props: Partial<React.ComponentProps<typeof Beacon>> = {}) => (
  <Beacon kind="light" visible x={100} y={200} {...props} />
);
const timed = (to: number) =>
  jest
    .mocked(withTiming)
    .mock.calls.filter(([value]) => value === to)
    .map(([, config]) => config as { duration: number });
const flat = () =>
  StyleSheet.flatten(screen.getByTestId('beacon', { includeHiddenElements: true }).props.style);

// A rerender replaces the whole tree, so the providers go back around it.
const wrap = (ui: React.ReactElement) => <ThemeProvider crossfade={false}>{ui}</ThemeProvider>;
const rendered = async (ui: React.ReactElement) => {
  const view = await render(ui);
  return { rerender: (next: React.ReactElement) => view.rerender(wrap(next)) };
};

beforeEach(() => {
  mockReduced = false;
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('the recording light', () => {
  it('takes up its breath in 700 ms when a take begins, and starts the breath once', async () => {
    const { rerender } = await rendered(light({ live: false }));
    expect(jest.mocked(withRepeat)).not.toHaveBeenCalled();
    await rerender(light({ live: true }));
    expect(timed(1).some((config) => config.duration === 700)).toBe(true);
    expect(jest.mocked(withRepeat)).toHaveBeenCalledTimes(1);
  });

  it('lets the breath go in 900 ms, keeps breathing meanwhile, and only then stops it', async () => {
    const { rerender } = await rendered(light({ live: true }));
    jest.mocked(cancelAnimation).mockClear();
    await rerender(light({ live: false }));
    expect(timed(0).some((config) => config.duration === 900)).toBe(true);
    // Nothing was cut off at the instant the take ended.
    expect(jest.mocked(cancelAnimation)).not.toHaveBeenCalled();
    await act(async () => void jest.advanceTimersByTime(900));
    expect(jest.mocked(cancelAnimation)).toHaveBeenCalled();
  });

  it('glides to its new place in 600 ms instead of jumping, and is placed by a transform', async () => {
    const { rerender } = await rendered(light({ y: 200 }));
    expect(flat().top).toBe(0);
    await rerender(light({ y: 400 }));
    expect(timed(400 - LIGHT / 2).some((config) => config.duration === 600)).toBe(true);
    // The layout position never changes: the move is the UI thread's, so no frame is out of step.
    expect(flat().top).toBe(0);
  });

  it('is a 180 ms fade under Reduce Motion: no breath, no glide', async () => {
    mockReduced = true;
    const { rerender } = await rendered(light({ live: false }));
    await rerender(light({ live: true }));
    expect(timed(1).some((config) => config.duration === tokens.motion.fast)).toBe(true);
    expect(jest.mocked(withRepeat)).not.toHaveBeenCalled();
  });

  it('dips out and back across a move under Reduce Motion, and is placed while it is out', async () => {
    mockReduced = true;
    const { rerender } = await rendered(light({ live: true, y: 200 }));
    jest.mocked(withTiming).mockClear();
    await rerender(light({ live: true, y: 300 }));
    const half = tokens.motion.fast / 2;
    // Out and back over the house fade, rather than a jump from one place to the other.
    expect(timed(0).some((config) => config.duration === half)).toBe(true);
    expect(timed(1).some((config) => config.duration === half)).toBe(true);
    expect(timed(300 - LIGHT / 2).some((config) => config.duration === 0)).toBe(true);
    expect(jest.mocked(withDelay)).toHaveBeenCalledWith(half, 300 - LIGHT / 2);
  });

  it('does not dip when it has not moved', async () => {
    mockReduced = true;
    const { rerender } = await rendered(light({ live: true, y: 200 }));
    jest.mocked(withTiming).mockClear();
    await rerender(light({ live: false, y: 200 }));
    expect(timed(0).some((config) => config.duration === tokens.motion.fast / 2)).toBe(false);
  });

  it('leaves the caret as it was: it follows typing and always beats', async () => {
    const { rerender } = await rendered(<Beacon kind="caret" visible x={10} y={50} />);
    expect(flat().top).toBe(50);
    await rerender(<Beacon kind="caret" visible x={10} y={90} />);
    expect(flat().top).toBe(90);
    expect(jest.mocked(withRepeat)).toHaveBeenCalled();
  });
});
