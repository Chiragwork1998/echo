import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router, usePathname } from 'expo-router';
import type { ReactElement } from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { EASE } from '@/design/ease';
import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';
import { usePreferences } from '@/state/preferences';
import { reanimatedMock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { HomeTabBar, TAB_BAR_HEIGHT, tabPaths } from './HomeTabBar';

jest.mock('@/design/haptics');
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));
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
const reduced = useReduceMotion as jest.Mock;
const timing = jest.spyOn(reanimatedMock, 'withTiming');
const delay = jest.spyOn(reanimatedMock, 'withDelay');
const wrap = (element: ReactElement) => <ThemeProvider crossfade={false}>{element}</ThemeProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  reduced.mockReturnValue(false);
  timing.mockClear();
  delay.mockClear();
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

type Drawn = {
  opacity?: number;
  bottom?: number;
  transform?: { translateX?: number; translateY?: number }[];
};
const drawn = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style) as Drawn;
const travel = (id: string, key: 'translateX' | 'translateY') =>
  drawn(id).transform?.find((part) => key in part)?.[key];

/** Tells the bar how wide its row is, as the device would: 382 across, so 93.5 for each tab. */
const measured = () =>
  act(() =>
    fireEvent(screen.getByTestId('home-tabs', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 382, height: 64 } },
    }),
  );
const TAB_W = (382 - 8) / 4;

describe('the pill and the dot', () => {
  it('rest under the current tab, whichever it is, and follow the measured width of the row', async () => {
    at('/home/patterns');
    await render(<HomeTabBar />);
    await measured();
    expect(travel('home-tab-pill', 'translateX')).toBeCloseTo(2 * TAB_W, 5);
    expect(travel('home-tab-dot', 'translateX')).toBeCloseTo(2 * TAB_W, 5);
    expect(StyleSheet.flatten(screen.getByTestId('home-tab-pill').props.style)).toMatchObject({
      width: TAB_W,
    });
  });

  it('are one pill and one dot, not one for each tab', async () => {
    await render(<HomeTabBar />);
    expect(screen.getAllByTestId('home-tab-pill', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getAllByTestId('home-tab-dot', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('are seen by Night and not by Day, where the golden has no pill', async () => {
    const night = await render(<HomeTabBar />);
    expect(drawn('home-tab-pill').opacity).toBe(1);
    await night.unmount();
    usePreferences.setState({ theme: 'day' });
    await render(<HomeTabBar />);
    expect(drawn('home-tab-pill').opacity).toBe(0);
    // The dot is Day's only mark of the current tab.
    expect(drawn('home-tab-dot').opacity).toBe(1);
  });

  it('glide to the next tab over 320 ms on the shared ease, the dot 40 ms behind', async () => {
    const view = await render(<HomeTabBar />);
    timing.mockClear();
    at('/home/you');
    await view.rerender(wrap(<HomeTabBar />));
    const calls = timing.mock.calls.map(
      (call) => call as unknown as [number, Record<string, unknown>],
    );
    expect(calls.filter(([to]) => to === 3)).toHaveLength(2);
    for (const [, config] of calls.filter(([to]) => to === 3)) {
      expect(config).toMatchObject({ duration: 320, easing: EASE });
    }
    expect(delay).toHaveBeenCalledWith(40, 3);
  });

  it('are placed at once when the bar was away, and not seen to travel', async () => {
    at('/home/session');
    const view = await render(<HomeTabBar />);
    timing.mockClear();
    at('/home/you');
    await view.rerender(wrap(<HomeTabBar />));
    await measured();
    expect(timing.mock.calls.filter((call) => call[0] === 3)).toHaveLength(0);
    expect(travel('home-tab-pill', 'translateX')).toBeCloseTo(3 * TAB_W, 5);
  });

  it('stay where they are while the bar is away, so the pill never slides to Today on the session', async () => {
    at('/home/you');
    const view = await render(<HomeTabBar />);
    await measured();
    timing.mockClear();
    at('/home/session');
    await view.rerender(wrap(<HomeTabBar />));
    expect(
      timing.mock.calls.filter(
        (call) =>
          call[0] === 0 && ((call as unknown[])[1] as { duration: number }).duration === 320,
      ),
    ).toHaveLength(0);
    expect(travel('home-tab-pill', 'translateX')).toBeCloseTo(3 * TAB_W, 5);
  });
});

describe('the pill and the dot under Reduce Motion', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('under Reduce Motion fade out over 90 ms, are placed, and fade in over 90 ms', async () => {
    reduced.mockReturnValue(true);
    const view = await render(<HomeTabBar />);
    timing.mockClear();
    at('/home/echoes');
    await view.rerender(wrap(<HomeTabBar />));
    expect(timing).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 90 }));
    expect(
      timing.mock.calls.filter(
        (call) =>
          call[0] === 1 && ((call as unknown[])[1] as { duration: number }).duration === 320,
      ),
    ).toHaveLength(0);
    timing.mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(90);
    });
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 90 }));
    await view.unmount();
  });
});

describe('the ink of the tabs', () => {
  const layers = (label: string) => {
    const texts = within(tab(label)).getAllByText(label, { includeHiddenElements: true });
    return texts.map((text) => StyleSheet.flatten(text.parent?.props.style) as Drawn);
  };

  it('draws every label twice, and only one copy is heard or found', async () => {
    await render(<HomeTabBar />);
    const label = copy.home.tabs[1];
    expect(within(tab(label)).getAllByText(label, { includeHiddenElements: true })).toHaveLength(2);
    expect(within(tab(label)).getAllByText(label)).toHaveLength(1);
  });

  it('is the golden at rest: the selected tab in full ink, the others at 0.62 of the quiet ink', async () => {
    at('/home/echoes');
    await render(<HomeTabBar />);
    const [quietSelected, inkSelected] = layers(copy.home.tabs[1]);
    expect(quietSelected?.opacity).toBe(0);
    expect(inkSelected?.opacity).toBe(1);
    const [quietIdle, inkIdle] = layers(copy.home.tabs[3]);
    expect(quietIdle?.opacity).toBeCloseTo(0.62, 5);
    expect(inkIdle?.opacity).toBe(0);
  });

  it('keeps every id, role and state on the tab itself', async () => {
    at('/home/patterns');
    await render(<HomeTabBar />);
    expect(screen.getByTestId('home-tab-patterns')).toBeTruthy();
    expect(tab(copy.home.tabs[2])).toBeSelected();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });
});

describe('the bar between Night and Day', () => {
  it('is laid out at one height and sits 8 pt lower by Day, as a transform and not as a layout', async () => {
    const night = await render(<HomeTabBar />);
    const nightBottom = drawn('home-dock').bottom;
    expect(travel('home-dock', 'translateY')).toBe(0);
    await night.unmount();
    usePreferences.setState({ theme: 'day' });
    await render(<HomeTabBar />);
    expect(drawn('home-dock').bottom).toBe(nightBottom);
    expect(travel('home-dock', 'translateY')).toBe(8);
  });
});

describe('the bar when the theme changes under it', () => {
  // The plates cross-fade over 900 ms behind it; the test lets that run out on a clock it owns.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('glides the 8 pt over 320 ms', async () => {
    const view = await render(<HomeTabBar />);
    timing.mockClear();
    await act(async () => usePreferences.setState({ theme: 'day' }));
    expect(timing).toHaveBeenCalledWith(8, expect.objectContaining({ duration: 320 }));
    await view.unmount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
  });
});

describe('the bar coming and going', () => {
  it('fades over 180 ms on the shared ease, and under Reduce Motion too', async () => {
    const view = await render(<HomeTabBar />);
    timing.mockClear();
    at('/home/entry');
    await view.rerender(wrap(<HomeTabBar />));
    expect(timing).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ duration: 180, easing: EASE, reduceMotion: 'never' }),
    );
  });
});
