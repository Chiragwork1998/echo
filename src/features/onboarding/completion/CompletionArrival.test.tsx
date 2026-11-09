// Completion after a daily session arrives by a fade of its own, over the session's book as it sinks. The
// stack's fade was not seen on the walked emulator (v11): a screen appeared in a frame or two, and Completion's
// plate cut the book away before its sink was drawn. How the fade looks is judged by eye; here is that it is
// a fade, from a hair above nothing, over the house's standard time, or its short one.
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { CompletionArrival } from './CompletionArrival';

let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));

beforeEach(() => {
  mockReduced = false;
  animationClock.reset();
  // The fade is walked a frame at a time, so that how much of it is drawn can be seen.
  animationClock.stepped = true;
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => {
  animationClock.reset();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const ui = () => (
  <CompletionArrival>
    <Text>You made space for yourself.</Text>
  </CompletionArrival>
);
const step = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
/** Draws the screen again, and says how much of it is drawn. */
const shown = async () => {
  await screen.rerender(<ThemeProvider crossfade={false}>{ui()}</ThemeProvider>);
  return StyleSheet.flatten(screen.getByTestId('completion-arrival').props.style).opacity as number;
};

describe('Completion arriving over the sinking book', () => {
  it('fades in from a hair above nothing, and is whole once its fade is done', async () => {
    await render(ui());
    const first = StyleSheet.flatten(screen.getByTestId('completion-arrival').props.style);
    // Drawn from its first frame, so that its photograph is on the GPU, and not yet seen.
    expect(first.opacity).toBeGreaterThan(0);
    expect(first.opacity).toBeLessThan(0.05);
    await step(tokens.motion.standard / 2);
    const half = await shown();
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    await step(tokens.motion.standard / 2 + 50);
    expect(await shown()).toBe(1);
  });

  it('fades in the house’s short time under Reduce Motion', async () => {
    mockReduced = true;
    await render(ui());
    await step(tokens.motion.fast + 50);
    expect(await shown()).toBe(1);
  });

  it('fades in the house’s short time for a screen reader', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await render(ui());
    await step(tokens.motion.fast + 50);
    expect(await shown()).toBe(1);
  });
});
