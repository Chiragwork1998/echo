// Echoes, Patterns, You and the entry reader all scroll on this one page. Seen on a release walk:
// Patterns' consent and You, scrolled, ran their words under the status bar's clock. The onboarding
// screens never do, because their scrolling begins below the status bar (src/components/ScreenShell.tsx),
// and this page now does the same.
import { act, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { backgroundSources } from '@/design/generated/backgrounds';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { TabPage } from './TabPage';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  usePathname: () => '/home/you',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
// The picture itself is not what is under test: that it is there, and where, is.
jest.mock('expo-image', () => {
  const { View: Box } = jest.requireActual('react-native');
  return { Image: (props: { source: unknown }) => <Box testID="plate" {...props} /> };
});

/** A phone with a 48 pt status bar. */
const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 48, bottom: 24, left: 0, right: 0 },
};
// The goldens set the header just inside the status bar's inset (docs/SPEC_CONFLICTS.md, C-03).
const BELOW_STATUS_BAR = 48 - 5;

async function page() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TabPage title="You">
        <Text>A row that scrolls</Text>
      </TabPage>
    </SafeAreaProvider>,
  );
  const scroll = screen.getByTestId('tab-page-scroll');
  return {
    scroll: StyleSheet.flatten(scroll.props.style),
    content: StyleSheet.flatten(scroll.props.contentContainerStyle),
    column: () => StyleSheet.flatten(screen.getByTestId('tab-page-column').props.style),
  };
}

describe('the tab page', () => {
  it('begins its scrolling below the status bar, so nothing scrolls under the clock', async () => {
    const { scroll } = await page();
    expect(scroll.marginTop).toBe(BELOW_STATUS_BAR);
  });

  it('keeps its title where it was, with the inset given once and not twice', async () => {
    const { content, column } = await page();
    expect(content.paddingTop ?? 0).toBe(0);
    expect(column().paddingTop ?? 0).toBe(0);
  });
});

// On Android, Echoes, Patterns and You are presented over Home, which stays up beneath them. Each is this
// page, so this page must cover the whole screen with a photograph of its own, in either theme.
describe('the tab page over Home', () => {
  type Json = { props: Record<string, unknown>; children?: (Json | string)[] | null };
  /** Whether every view from the page's root down to its plate fills the screen. */
  function plateFillsTheScreen(source: unknown): boolean {
    const fills = (style: unknown) => {
      const flat = (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
      const absolute =
        flat.position === 'absolute' &&
        flat.top === 0 &&
        flat.left === 0 &&
        flat.right === 0 &&
        flat.bottom === 0;
      return absolute || flat.flex === 1;
    };
    let found = false;
    const walk = (node: unknown, ok: boolean): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach((child) => walk(child, ok));
      const { props, children } = node as Json;
      const here = ok && (props.style === undefined || fills(props.style));
      if (props.testID === 'plate' && props.source === source && here) found = true;
      walk(children, here);
    };
    walk(screen.toJSON(), true);
    return found;
  }

  it.each(['night', 'day'] as const)('covers the screen with Home’s plate by %s', async (theme) => {
    await act(async () => usePreferences.setState({ theme }));
    await page();
    expect(plateFillsTheScreen(backgroundSources[theme].home)).toBe(true);
  });
});
