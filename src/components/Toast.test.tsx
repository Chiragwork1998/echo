import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions } from 'react-native';

import { render } from '@/testing/render';

import { clearToast, showToast, ToastHost } from './Toast';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const MESSAGE = 'We’ll meet you at 9:30 PM.';
const NEXT = 'We’ll meet you at 8:00 AM.';
const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(() => {
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
  announce.mockReset();
  announce.mockImplementation(() => undefined);
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
});
