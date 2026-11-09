import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { Surface } from '@/features/tab-pages/parts';
import { usePreferences } from '@/state/preferences';
import { animationClock } from '@/testing/reanimatedMock';

import { ThemeProvider } from './theme';
import { tokens } from './tokens';

// Every piece of glass takes its tint from GlassFill, so that it follows the photograph on the UI
// thread when the theme changes (GlassFill.test.tsx). These are the pieces that were still a single
// colour of the controls' palette: GlassCard, which every card and the tab bar are, and Surface, which
// every page's glass is.

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'dark'),
}));

const HIDDEN = { includeHiddenElements: true };
const fill = (theme: 'day' | 'night') => screen.getAllByTestId(`glass-fill-${theme}`, HIDDEN);
const opacityOf = (node: { props: Record<string, unknown> }) =>
  (StyleSheet.flatten(node.props.style as object) as { opacity: number }).opacity;
const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeAll(() => {
  jest.useFakeTimers();
});

beforeEach(async () => {
  animationClock.reset();
  await act(async () => usePreferences.setState({ theme: 'night' }));
});

afterEach(() => animationClock.reset());

describe.each([
  [
    'GlassCard',
    (strength?: 'regular' | 'strong') => (
      <GlassCard strength={strength}>
        <Text>Words</Text>
      </GlassCard>
    ),
  ],
  [
    'Surface',
    (strength?: 'regular' | 'strong') => (
      <Surface strength={strength}>
        <Text>Words</Text>
      </Surface>
    ),
  ],
] as const)('%s', (_name, glass) => {
  const tree = (strength?: 'regular' | 'strong') => (
    <ThemeProvider>{glass(strength)}</ThemeProvider>
  );

  it('draws the tint of both themes, one of them wholly clear at rest', async () => {
    await render(tree());
    expect(fill('night')).toHaveLength(1);
    expect(fill('day')).toHaveLength(1);
    expect(opacityOf(fill('night')[0]!)).toBe(1);
    expect(opacityOf(fill('day')[0]!)).toBe(0);
    expect(StyleSheet.flatten(fill('night')[0]!.props.style as object)).toMatchObject({
      backgroundColor: tokens.color.night.surfaceGlass,
    });
    expect(StyleSheet.flatten(fill('day')[0]!.props.style as object)).toMatchObject({
      backgroundColor: tokens.color.day.surfaceGlass,
    });
  });

  it('draws the strong tint of both themes when it is the strong glass', async () => {
    await render(tree('strong'));
    expect(StyleSheet.flatten(fill('night')[0]!.props.style as object)).toMatchObject({
      backgroundColor: tokens.color.night.surfaceGlassStrong,
    });
    expect(StyleSheet.flatten(fill('day')[0]!.props.style as object)).toMatchObject({
      backgroundColor: tokens.color.day.surfaceGlassStrong,
    });
  });

  it('cross-fades from Night to Day on the UI thread, whatever JavaScript is doing', async () => {
    animationClock.stepped = true;
    const view = await render(tree());
    await act(async () => usePreferences.setState({ theme: 'day' }));
    await wait(290 + 160);
    await view.rerender(tree());
    const night = opacityOf(fill('night')[0]!);
    expect(night).toBeGreaterThan(0.05);
    expect(night).toBeLessThan(0.95);
    expect(opacityOf(fill('day')[0]!)).toBeCloseTo(1 - night, 5);
  });
});
