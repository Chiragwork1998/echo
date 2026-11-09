import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router, usePathname } from 'expo-router';
import type { ReactElement } from 'react';
import { Dimensions, Pressable, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { EASE } from '@/design/ease';
import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';
import { usePreferences } from '@/state/preferences';
import { animationClock, reanimatedMock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import {
  goToTab,
  HomeTabBar,
  HomeTabBarProvider,
  TAB_BAR_HEIGHT,
  tabPaths,
  useRevealTabBar,
} from './HomeTabBar';

jest.mock('@/design/haptics');
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
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
    expect(router.push).toHaveBeenCalledWith('/home/patterns');
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('tick');
    jest.clearAllMocks();
    await fireEvent.press(tab(copy.home.tabs[0]));
    for (const go of [router.navigate, router.push, router.replace, router.dismissTo]) {
      expect(go).not.toHaveBeenCalled();
    }
    expect(cue).not.toHaveBeenCalled();
  });

  it('works in Day as well', async () => {
    usePreferences.setState({ theme: 'day' });
    at('/home/echoes');
    await render(<HomeTabBar />);
    expect(tab(copy.home.tabs[1])).toBeSelected();
    await fireEvent.press(tab(copy.home.tabs[3]));
    expect(router.replace).toHaveBeenCalledWith('/home/you');
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

// The screens over Home are drawn in the stack beneath the bar, which is drawn above it. While one of
// them is up, the bar is not drawn, touched or heard.
describe('the bar over the screens that cover Home', () => {
  it.each(['/home/session', '/home/breathe', '/home/rehearse', '/home/complete', '/home/entry'])(
    'is not drawn at all on %s',
    async (path) => {
      at(path);
      await render(<HomeTabBar />);
      expect(drawn('home-dock').opacity).toBe(0);
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
    },
  );
});

// Completion leaves by a fade of its own before the route goes back to Home. The walk (v11) saw the bar,
// which came with the route, over its card in two Enter your space of six, and 0.7 s late after a Back.
describe('a screen that brings the bar in as it goes', () => {
  const FADE_MS = 320;
  function Leaving() {
    const reveal = useRevealTabBar();
    return <Pressable testID="leave" onPress={() => reveal(FADE_MS)} />;
  }
  const ui = () => (
    <HomeTabBarProvider>
      <Leaving />
      <HomeTabBar />
    </HomeTabBarProvider>
  );
  const advance = (ms: number) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  /** Draws the bar again, and says how much of it is drawn. */
  const shown = async (view: Awaited<ReturnType<typeof render>>) => {
    await view.rerender(wrap(ui()));
    return drawn('home-dock').opacity;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    // The fades are walked, a frame at a time, so that how much is drawn can be seen.
    animationClock.stepped = true;
  });
  afterEach(() => {
    animationClock.reset();
    jest.useRealTimers();
  });

  it('brings it in once the fade has had its time, over the bar’s own 180 ms', async () => {
    at('/home/complete');
    const view = await render(ui());
    await fireEvent.press(screen.getByTestId('leave'));
    await advance(FADE_MS - 20);
    expect(await shown(view)).toBe(0);
    await advance(20 + 90);
    const coming = await shown(view);
    expect(coming).toBeGreaterThan(0);
    expect(coming).toBeLessThan(1);
    await advance(200);
    expect(await shown(view)).toBe(1);
    // Seen, over Home, but not yet touched or heard: that follows Home's route, when the screen is popped.
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    at('/home');
    expect(await shown(view)).toBe(1);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('is taken away again by the route that comes, if it is not a tab’s', async () => {
    at('/home/complete');
    const view = await render(ui());
    await fireEvent.press(screen.getByTestId('leave'));
    await advance(FADE_MS + 300);
    expect(await shown(view)).toBe(1);
    at('/home/entry');
    await shown(view);
    await advance(300);
    expect(await shown(view)).toBe(0);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('is nothing to a bar drawn without the provider', async () => {
    at('/home/complete');
    const view = await render(
      <>
        <Leaving />
        <HomeTabBar />
      </>,
    );
    await fireEvent.press(screen.getByTestId('leave'));
    await advance(FADE_MS + 300);
    await view.rerender(
      wrap(
        <>
          <Leaving />
          <HomeTabBar />
        </>,
      ),
    );
    expect(drawn('home-dock').opacity).toBe(0);
  });
});

// The diagnostic build (walk v11): `navigate` pushed a new screen on every tab tap, and every tab ever
// reached stayed mounted and read the journal again on each change. After twelve rounds a change cost a
// hundred reads, the JS thread stalled for 400 to 700 ms, and Back on an empty page took 7 s.
describe('tabs never grow Home’s stack', () => {
  /** Home's stack as the router leaves it: what the navigator's state holds. */
  let stack: string[];
  beforeEach(() => {
    stack = ['/home'];
    jest.mocked(router.push).mockImplementation(((path: string) => void stack.push(path)) as never);
    jest.mocked(router.replace).mockImplementation(((path: string) => {
      stack[stack.length - 1] = path;
    }) as never);
    jest.mocked(router.dismissTo).mockImplementation(((path: string) => {
      const at = stack.lastIndexOf(path);
      stack = at >= 0 ? stack.slice(0, at + 1) : [...stack, path];
    }) as never);
    // As it does on this version of expo-router: it pushes.
    jest
      .mocked(router.navigate)
      .mockImplementation(((path: string) => void stack.push(path)) as never);
  });

  /** Taps the tab at `index` from wherever the stack has got to. */
  async function tap(view: Awaited<ReturnType<typeof render>>, index: number) {
    at(stack[stack.length - 1]!);
    await view.rerender(wrap(<HomeTabBar />));
    await fireEvent.press(tab(copy.home.tabs[index]!));
  }

  it('leaves at most Today and one tab, through ten rounds of every tab in turn', async () => {
    const view = await render(<HomeTabBar />);
    for (let round = 0; round < 10; round += 1) {
      for (const index of [1, 2, 3, 0]) {
        await tap(view, index);
        expect(stack.length).toBeLessThanOrEqual(2);
        expect(stack[0]).toBe('/home');
        expect(stack[stack.length - 1]).toBe(tabPaths[index]);
      }
    }
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('leaves at most Today and one tab, whatever order the tabs are tapped in', async () => {
    const view = await render(<HomeTabBar />);
    // A fixed scramble, the same on every run, with taps on the tab already on show among them.
    let seed = 7;
    for (let i = 0; i < 60; i += 1) {
      seed = (seed * 48271) % 2147483647;
      const index = seed % 4;
      await tap(view, index);
      expect(stack.length).toBeLessThanOrEqual(2);
      expect(stack[0]).toBe('/home');
      expect(stack[stack.length - 1]).toBe(tabPaths[index]);
    }
  });

  it('goes back to Today from any tab by popping to it', async () => {
    for (const from of tabPaths.slice(1)) {
      jest.clearAllMocks();
      at(from);
      const view = await render(<HomeTabBar />);
      await fireEvent.press(tab(copy.home.tabs[0]));
      expect(router.dismissTo).toHaveBeenCalledWith('/home');
      expect(router.push).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      await view.unmount();
    }
  });

  it('pushes a tab over Today once, and replaces one tab with the next', () => {
    goToTab('/home/echoes', '/home');
    expect(router.push).toHaveBeenCalledWith('/home/echoes');
    goToTab('/home/patterns', '/home/echoes');
    expect(router.replace).toHaveBeenCalledWith('/home/patterns');
    goToTab('/home', '/home/patterns');
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
    jest.clearAllMocks();
    goToTab('/home/you', '/home/you');
    for (const go of [router.navigate, router.push, router.replace, router.dismissTo]) {
      expect(go).not.toHaveBeenCalled();
    }
  });
});
