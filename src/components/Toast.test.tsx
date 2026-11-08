import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions } from 'react-native';

import { render } from '@/testing/render';

import { useReduceMotion } from '@/design/useReduceMotion';
import { reanimatedMock } from '@/testing/reanimatedMock';

import { clearToast, dwellFor, showToast, ToastHost } from './Toast';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const MESSAGE = 'We’ll meet you at 9:30 PM.';
const NEXT = 'We’ll meet you at 8:00 AM.';
const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
const timing = jest.spyOn(reanimatedMock, 'withTiming');

jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));
const reduced = useReduceMotion as jest.Mock;

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(() => {
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
  announce.mockReset();
  announce.mockImplementation(() => undefined);
  reduced.mockReturnValue(false);
  timing.mockClear();
});

afterEach(async () => {
  await act(async () => clearToast());
});

const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/** The toast's outer layer, which positions it on the screen. */
const dock = (text: string) => screen.getByText(text).parent?.parent;

describe('Toast', () => {
  it('shows nothing until something is said', async () => {
    await render(<ToastHost />);
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it('shows its line and announces it to screen readers once', async () => {
    await render(<ToastHost />);
    await act(async () => showToast(MESSAGE));
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(screen.getByLabelText(MESSAGE)).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(MESSAGE);
  });

  it('goes away on its own', async () => {
    await render(<ToastHost />);
    await act(async () => showToast(MESSAGE));
    await wait(1000);
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    await wait(4000);
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it('lets a newer line replace the one showing, and says that one too', async () => {
    await render(<ToastHost />);
    await act(async () => showToast(MESSAGE));
    await wait(1000);
    await act(async () => showToast(NEXT));
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(screen.getByText(NEXT)).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(2);
    // The first line's timers are gone, so they cannot take the second away early.
    await wait(2500);
    expect(screen.getByText(NEXT)).toBeTruthy();
  });

  it('never takes a touch from what is beneath it', async () => {
    await render(<ToastHost />);
    await act(async () => showToast(MESSAGE));
    expect(dock(MESSAGE)?.props.pointerEvents).toBe('none');
  });

  it('rests above the CTA and the tab bar, whatever the bottom inset', async () => {
    await render(<ToastHost />);
    await act(async () => showToast(MESSAGE));
    const style = dock(MESSAGE)?.props.style as { bottom?: number }[];
    const bottom = style.find((part) => part.bottom !== undefined)?.bottom;
    // The jest safe-area mock has no inset. The CTA ends 74 pt above it, the Night tab bar 83.
    expect(bottom).toBeGreaterThan(83);
  });

  it('stays longer for a longer line: a beat and 48 ms a character, between 2.2 and 4.2 seconds', () => {
    expect(dwellFor('x'.repeat(10))).toBe(2200);
    expect(dwellFor('x'.repeat(40))).toBe(1400 + 48 * 40);
    expect(dwellFor('x'.repeat(60))).toBe(4200);
    expect(dwellFor('x'.repeat(200))).toBe(4200);
  });

  it.each([
    [10, 2200],
    [60, 4200],
    [200, 4200],
  ])('a line of %i characters arrives, stays %i ms, and leaves', async (length, dwell) => {
    const line = 'x'.repeat(length);
    await render(<ToastHost />);
    await act(async () => showToast(line));
    // 480 ms to arrive, the dwell, then 480 ms to lift away.
    await wait(480 + dwell + 479);
    expect(screen.queryByText(line)).toBeTruthy();
    await wait(1);
    expect(screen.queryByText(line)).toBeNull();
  });

  it('arrives over 240 ms of opacity and 480 of rise, and leaves over 320 and 480', async () => {
    await render(<ToastHost />);
    await act(async () => showToast(MESSAGE));
    const asked = () =>
      timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);
    expect(asked().sort((a, b) => a - b)).toEqual([240, 480]);
    timing.mockClear();
    await wait(480 + dwellFor(MESSAGE));
    expect(asked().sort((a, b) => a - b)).toEqual([320, 480]);
  });

  it('under Reduce Motion fades in 180 ms with the same dwell, and nothing travels', async () => {
    reduced.mockReturnValue(true);
    await render(<ToastHost />);
    await act(async () => showToast(MESSAGE));
    const asked = () =>
      timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);
    expect(asked()).toEqual([180]);
    await wait(180 + dwellFor(MESSAGE) + 179);
    expect(screen.queryByText(MESSAGE)).toBeTruthy();
    await wait(1);
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(asked()).toEqual([180, 180]);
  });
});
