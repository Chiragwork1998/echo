// Echoes, Patterns, You and the entry reader all scroll on this one page. Seen on a release walk:
// Patterns' consent and You, scrolled, ran their words under the status bar's clock. The onboarding
// screens never do, because their scrolling begins below the status bar (src/components/ScreenShell.tsx),
// and this page now does the same.
import { screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
