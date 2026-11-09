import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, useColorScheme } from 'react-native';

import { usePreferences } from '@/state/preferences';
import { animationClock } from '@/testing/reanimatedMock';

import { GlassFill } from './GlassFill';
import { ThemeProvider } from './theme';
import { tokens } from './tokens';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'dark'),
}));

const HIDDEN = { includeHiddenElements: true };
const layer = (theme: 'day' | 'night') => screen.getByTestId(`glass-fill-${theme}`, HIDDEN);
const style = (theme: 'day' | 'night') =>
  StyleSheet.flatten(layer(theme).props.style as object) as {
    opacity: number;
    backgroundColor: string;
  };
const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
const tree = (strong = false) => (
  <ThemeProvider>
    <GlassFill strong={strong} />
  </ThemeProvider>
);
/** A real animated style follows its value by itself; the stand-in is read each time it is drawn. */
const draw = (view: Awaited<ReturnType<typeof render>>, strong = false) =>
  view.rerender(tree(strong));

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.mocked(useColorScheme).mockReturnValue('dark');
  animationClock.reset();
  await act(async () => usePreferences.setState({ theme: 'night' }));
});

afterEach(() => {
  animationClock.reset();
  jest.restoreAllMocks();
});

// The walk (v10): going to Day or to Night, the glass snapped in one frame while the photograph
// dissolved. The glass was a colour in the controls' palette, which JavaScript moves a step at a time,
// and a busy JavaScript thread takes the steps late and all at once. Both themes' glass are drawn, and
// the UI thread, which moves the photograph, fades one into the other.
describe('the glass fill when the theme changes', () => {
  it('is Night’s own at rest in Night, and Day’s own at rest in Day', async () => {
    const view = await render(tree());
    expect(style('night')).toMatchObject({
      opacity: 1,
      backgroundColor: tokens.color.night.surfaceGlass,
    });
    expect(style('day').opacity).toBe(0);
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await wait(2000);
    await draw(view);
    expect(style('day')).toMatchObject({
      opacity: 1,
      backgroundColor: tokens.color.day.surfaceGlass,
    });
    expect(style('night').opacity).toBe(0);
  });

  it('is the strong glass of each theme when asked', async () => {
    await render(tree(true));
    expect(style('night').backgroundColor).toBe(tokens.color.night.surfaceGlassStrong);
    expect(style('day').backgroundColor).toBe(tokens.color.day.surfaceGlassStrong);
  });

  it('holds Night for the 290 ms the controls wait, then moves over 320 ms, never jumping', async () => {
    animationClock.stepped = true;
    const view = await render(tree());
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await wait(150);
    await draw(view);
    expect(style('night').opacity).toBe(1);

    const seen: number[] = [];
    for (let at = 0; at < 340; at += 40) {
      await wait(40);
      await draw(view);
      seen.push(style('night').opacity);
    }
    // Part of the way, in both layers, at some point: a cross-fade and not a switch.
    expect(seen.some((opacity) => opacity > 0.05 && opacity < 0.95)).toBe(true);
    expect(style('day').opacity).toBeCloseTo(1 - style('night').opacity, 5);
    // Monotonic, and every step a part of the whole: no one-frame snap.
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]!);
    expect(Math.max(...seen.slice(1).map((value, i) => seen[i]! - value))).toBeLessThan(0.6);

    await wait(300);
    await draw(view);
    expect(style('night').opacity).toBe(0);
    expect(style('day').opacity).toBe(1);
  });

  it('goes back from wherever it had got to when the theme changes again', async () => {
    animationClock.stepped = true;
    const view = await render(tree());
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await wait(290 + 160);
    await draw(view);
    const middle = style('night').opacity;
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    await act(async () => usePreferences.setState({ theme: 'night' }));
    await wait(1000);
    await draw(view);
    expect(style('night').opacity).toBe(1);
    expect(style('day').opacity).toBe(0);
  });

  it('takes no touches: it is only a tint', async () => {
    await render(tree());
    expect(layer('night').props.pointerEvents).toBe('none');
    expect(layer('day').props.pointerEvents).toBe('none');
  });
});
