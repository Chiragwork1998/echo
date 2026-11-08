import { fireEvent, screen } from '@testing-library/react-native';
import { router, usePathname } from 'expo-router';
import { Dimensions } from 'react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { HomeTabBar, TAB_BAR_HEIGHT, tabPaths } from './HomeTabBar';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
  usePathname: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const at = (path: string) => (usePathname as jest.Mock).mockReturnValue(path);
const tab = (name: string) => screen.getByRole('tab', { name });

beforeEach(() => {
  jest.clearAllMocks();
  usePreferences.setState({ theme: 'night' });
  const metrics = { width: 393, height: 852, scale: 2, fontScale: 1 };
  Dimensions.set({ window: metrics, screen: metrics });
  at('/home');
});

describe('HomeTabBar', () => {
  it('is 72 pt tall and has the four tabs in order', async () => {
    expect(TAB_BAR_HEIGHT).toBe(72);
    await render(<HomeTabBar />);
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual([
      ...copy.home.tabs,
    ]);
  });

  it.each([
    ['/home', 0],
    ['/home/echoes', 1],
    ['/home/patterns', 2],
    ['/home/you', 3],
  ])('marks only the current tab selected at %s', async (path, index) => {
    at(path);
    await render(<HomeTabBar />);
    screen.getAllByRole('tab').forEach((t, i) => {
      if (i === index) expect(t).toBeSelected();
      else expect(t).not.toBeSelected();
    });
  });

  it('goes to another tab on press, and ignores a press on the current one', async () => {
    await render(<HomeTabBar />);
    await fireEvent.press(tab(copy.home.tabs[2]));
    expect(router.navigate).toHaveBeenCalledWith('/home/patterns');
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('tick');
    jest.clearAllMocks();
    await fireEvent.press(tab(copy.home.tabs[0]));
    expect(router.navigate).not.toHaveBeenCalled();
    expect(cue).not.toHaveBeenCalled();
  });

  it('works in Day as well', async () => {
    usePreferences.setState({ theme: 'day' });
    at('/home/echoes');
    await render(<HomeTabBar />);
    expect(tab(copy.home.tabs[1])).toBeSelected();
    await fireEvent.press(tab(copy.home.tabs[3]));
    expect(router.navigate).toHaveBeenCalledWith('/home/you');
  });

  it.each(['/home/session', '/home/complete'])(
    'is hidden from everyone on %s, and not only from sight',
    async (path) => {
      at(path);
      await render(<HomeTabBar />);
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      expect(screen.getAllByRole('tab', { hidden: true })).toHaveLength(4);
    },
  );

  it('covers exactly the four tab routes', () => {
    expect(tabPaths).toEqual(['/home', '/home/echoes', '/home/patterns', '/home/you']);
  });
});
