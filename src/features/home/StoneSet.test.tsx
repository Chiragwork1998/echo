import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Pressable, StyleSheet, Text } from 'react-native';

import { copy } from '@/content/copy';
import { goldenCopy } from '@/content/goldenCopy';
import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { useHomeSummary, type HomeSummary, type Rhythm } from '@/features/journal';
import { useOnboarding } from '@/state/onboarding';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import {
  ARRIVAL_AFTER_IDLE_MS,
  DISSOLVE_MS,
  HomeDissolveProvider,
  REDUCED_FADE_MS,
  useHomeDissolve,
} from './dissolve';
import { HomeScreen } from './screens/HomeScreen';
import { homeLabels } from './today/homeLabels';
import { useStoneMemory, WELCOME_WINDOW_MS } from './today/stoneMemory';
import {
  HOLD_MS,
  NIGHT_END_MS,
  PEBBLE_COOL_MS,
  REDUCED_MS,
  SETTLE_AT_MS,
  WELCOME_ARRIVAL_AT_MS,
  DAY_END_MS,
  PEBBLE_SETTLE_AT_MS,
  END_MARGIN_MS,
} from './today/stoneMotion';

jest.mock('@/design/haptics');
// A link of the week's trail becomes a plain view, so that the test can count them.
jest.mock('react-native-svg', () => {
  const actual = jest.requireActual('react-native-svg');
  const { View } = jest.requireActual('react-native');
  return { ...actual, __esModule: true, Line: () => <View testID="link" /> };
});
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  usePathname: () => mockPath,
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
// Evening, whatever the hour the tests run.
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => false,
}));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useHomeSummary: jest.fn(),
}));

let mockPath = '/home';
const mockedSummary = jest.mocked(useHomeSummary);

// A Thursday, as in the goldens: Monday to Wednesday are built, and today is the day to come.
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const rhythmThrough = (last: number, patch: Partial<Rhythm> = {}): Rhythm => {
  const week = WEEKDAYS.map((weekday, i) => ({
    day: `2026-11-0${2 + i}`,
    weekday,
    completed: i <= last,
    isToday: i === 3,
  }));
  const built = week.filter((day) => day.completed).length;
  return {
    today: '2026-11-05',
    week,
    weekReflections: built,
    currentStreak: built,
    totalDays: built,
    totalReflections: built,
    ...patch,
  };
};
const summaryOf = (rhythm: Rhythm): HomeSummary => ({
  status: 'ready',
  rhythm,
  recent: null,
  continueDraft: null,
  error: null,
  refresh: jest.fn(async () => undefined),
});
const OPEN = rhythmThrough(2);
const DONE = rhythmThrough(3);
/** A second echo the same day: the same days, one more reflection. */
const SECOND = rhythmThrough(3, { weekReflections: 5, totalReflections: 5 });
/** Home's first look: today is the only day there has ever been. */
const FIRST = rhythmThrough(-1, {
  week: rhythmThrough(-1).week.map((day) => (day.isToday ? { ...day, completed: true } : day)),
  weekReflections: 1,
  currentStreak: 1,
  totalDays: 1,
  totalReflections: 1,
});

function Probe() {
  const control = useHomeDissolve();
  return (
    <>
      <Text testID="phase">{control.phase}</Text>
      <Pressable testID="opened" onPress={control.sessionOpened} />
      <Pressable testID="closed" onPress={control.sessionClosed} />
    </>
  );
}
// A new element each time, so that a re-render really reaches Home.
const home = () => (
  <HomeDissolveProvider>
    <HomeScreen />
    <Probe />
  </HomeDissolveProvider>
);

const tick = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
const HIDDEN = { includeHiddenElements: true };
const phase = () => screen.getByTestId('phase').props.children;
const building = () => screen.queryByTestId('cairn-building', HIDDEN);
const today = () => screen.getByLabelText(/^Thursday/, HIDDEN).props.accessibilityLabel as string;
const count = (n: number) => screen.queryByText(goldenCopy.nightRhythm(n), HIDDEN);
const settles = () => jest.mocked(cue).mock.calls.filter(([name]) => name === 'settle').length;

let appState: ((state: string) => void) | undefined;

async function show(rhythm: Rhythm) {
  mockedSummary.mockReturnValue(summaryOf(rhythm));
  return render(home());
}
const showAgain = (view: Awaited<ReturnType<typeof show>>, rhythm: Rhythm) => {
  mockedSummary.mockReturnValue(summaryOf(rhythm));
  return view.rerender(<ThemeProvider crossfade={false}>{home()}</ThemeProvider>);
};

const begin = () =>
  fireEvent.press(
    screen.queryByTestId('home-begin-stone') ??
      screen.getByRole('button', { name: copy.home.begin }),
  );

/** Begin, the session, and the kept entry: Home is dissolved and has been told what happened. */
async function keepAnEchoWhileAway(view: Awaited<ReturnType<typeof show>>, after: Rhythm) {
  await begin();
  await tick(DISSOLVE_MS);
  await fireEvent.press(screen.getByTestId('opened'));
  await showAgain(view, after);
}
/** The session closes. Home gives itself back, and is whole again ARRIVAL_AFTER_IDLE_MS later. */
async function sessionCloses() {
  await fireEvent.press(screen.getByTestId('closed'));
  await tick(60);
  expect(phase()).toBe('idle');
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockPath = '/home';
  appState = undefined;
  useStoneMemory.getState().reset();
  usePreferences.setState({ theme: 'night', homeWelcomed: true });
  useOnboarding.setState({ completedAt: undefined });
  // Spies on a mocked function outlive restoreAllMocks, so every test says what it wants.
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, handler: unknown) => {
    if (type === 'change') appState = handler as (state: string) => void;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('a stone is set, at night', () => {
  it('shows the day open until Home is whole again, then builds the cairn before the eyes', async () => {
    const view = await show(OPEN);
    expect(today()).not.toMatch(/completed/);
    await keepAnEchoWhileAway(view, DONE);

    // Kept, but not yet set: Home is as the person last saw it, the day open and the count as it was.
    expect(today()).not.toMatch(/completed/);
    expect(count(3)).not.toBeNull();
    expect(count(4)).toBeNull();
    await tick(5000);
    expect(building()).toBeNull();
    expect(settles()).toBe(0);

    await sessionCloses();
    // Home is whole again, and then a beat more, so that the open outline is seen first.
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS - 1);
    expect(building()).toBeNull();
    await tick(1);
    expect(building()).not.toBeNull();
    expect(today()).toMatch(/completed/);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(homeLabels.cairnBuilt);
    // The old count is leaving as the new one arrives.
    expect(count(3)).not.toBeNull();
    expect(count(4)).not.toBeNull();
  });

  it('hands today’s link to tomorrow from the quiet line to the kept one, and not in a single step', async () => {
    const view = await show(OPEN);
    const links = () => screen.queryAllByTestId('link', HIDDEN).length;
    // Six links in the week, one between each pair of days.
    expect(links()).toBe(6);
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    expect(links()).toBe(6);
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    // Both are drawn while one gives way to the other.
    expect(links()).toBe(7);
    await tick(NIGHT_END_MS + END_MARGIN_MS);
    expect(links()).toBe(6);
  });

  it('makes one haptic, when the top stone has landed, and none for the other stones', async () => {
    const view = await show(OPEN);
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    expect(settles()).toBe(0);
    await tick(SETTLE_AT_MS - 1);
    expect(settles()).toBe(0);
    await tick(1);
    expect(settles()).toBe(1);
    await tick(NIGHT_END_MS);
    expect(settles()).toBe(1);
    // Begin's own commit, and the one settle: nothing for the count, nothing for the loop.
    expect(jest.mocked(cue).mock.calls).toEqual([['commit'], ['settle']]);
  });

  it('goes back to the plain cairn, and the new count alone, when it is done', async () => {
    const view = await show(OPEN);
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    await tick(NIGHT_END_MS + END_MARGIN_MS);
    expect(building()).toBeNull();
    expect(today()).toMatch(/completed/);
    expect(count(3)).toBeNull();
    expect(count(4)).not.toBeNull();
    expect(useStoneMemory.getState().pending).toBeNull();
  });

  it('never plays while Home is dissolving, covered by another screen, or the app is away', async () => {
    const view = await show(OPEN);
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    // Another tab covers Home just before it would play.
    await tick(ARRIVAL_AFTER_IDLE_MS);
    mockPath = '/home/echoes';
    await showAgain(view, DONE);
    await tick(HOLD_MS + 3000);
    expect(building()).toBeNull();
    // The app goes away, and Home comes back to the front.
    mockPath = '/home';
    await showAgain(view, DONE);
    await act(async () => appState?.('background'));
    await tick(3000);
    expect(building()).toBeNull();
    // It plays once Home has been whole, in front and in sight for the whole wait.
    await act(async () => appState?.('active'));
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    expect(building()).not.toBeNull();
  });

  it('is not pressed into a Begin: the haptic is not made once Home is dissolving', async () => {
    const view = await show(OPEN);
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    expect(building()).not.toBeNull();
    // Begin is pressed while the stone is still settling.
    await begin();
    await tick(SETTLE_AT_MS + 10);
    expect(settles()).toBe(0);
  });

  it('plays nothing on a cold start, whatever the week looks like', async () => {
    await show(DONE);
    expect(today()).toMatch(/completed/);
    expect(building()).toBeNull();
    await tick(10_000);
    expect(building()).toBeNull();
    expect(jest.mocked(cue)).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  it('plays nothing for a restore, an import or a backfilled entry', async () => {
    // Today was already done when Home first looked; a later day of the week fills in behind it.
    const view = await show(DONE);
    await showAgain(view, rhythmThrough(3, { weekReflections: 4, totalReflections: 9 }));
    await tick(10_000);
    expect(building()).toBeNull();
    expect(settles()).toBe(0);
  });

  it('only changes the count for a second echo the same day, with no stone and no haptic', async () => {
    const view = await show(DONE);
    await begin();
    await tick(DISSOLVE_MS);
    await fireEvent.press(screen.getByTestId('opened'));
    await showAgain(view, SECOND);
    expect(count(4)).not.toBeNull();
    expect(count(5)).toBeNull();
    await sessionCloses();
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    expect(building()).toBeNull();
    expect(count(4)).not.toBeNull();
    expect(count(5)).not.toBeNull();
    await tick(NIGHT_END_MS + END_MARGIN_MS);
    expect(count(4)).toBeNull();
    expect(count(5)).not.toBeNull();
    expect(settles()).toBe(0);
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  it('does not set the same day’s stone twice if the echo is deleted and written again', async () => {
    const view = await show(OPEN);
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    await tick(NIGHT_END_MS + END_MARGIN_MS);
    expect(settles()).toBe(1);
    await showAgain(view, OPEN);
    await showAgain(view, DONE);
    await tick(10_000);
    expect(building()).toBeNull();
    expect(settles()).toBe(1);
  });

  it('draws the same Home at rest as it always has', async () => {
    await show(OPEN);
    expect(screen.getAllByLabelText(/completed/)).toHaveLength(3);
    expect(count(3)).not.toBeNull();
  });
});

describe('a stone is set, with Reduce Motion', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  });

  it('holds the room for the new pebble from the moment Day returns, and carries nothing', async () => {
    usePreferences.setState({ theme: 'day' });
    const view = await show(OPEN);
    await act(async () => undefined);
    expect(screen.queryByTestId('pebble-room', HIDDEN)).toBeNull();
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    // An empty place at the end of the row: the pebble comes into it, and nothing moves.
    expect(screen.queryByTestId('pebble-room', HIDDEN)).not.toBeNull();
    await tick(REDUCED_FADE_MS + HOLD_MS);
    expect(screen.queryByTestId('pebble-entering', HIDDEN)).not.toBeNull();
    expect(screen.queryByTestId('pebble-room', HIDDEN)).toBeNull();
    expect(screen.queryAllByTestId('pebble-carried', HIDDEN)).toHaveLength(0);
    await tick(REDUCED_MS + END_MARGIN_MS);
    expect(screen.queryByTestId('pebble-entering', HIDDEN)).toBeNull();
  });

  it('waits only as long as the quick return, and fades for 180 ms, with the haptic kept', async () => {
    const view = await show(OPEN);
    await act(async () => undefined);
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    await tick(REDUCED_FADE_MS + HOLD_MS);
    expect(building()).not.toBeNull();
    expect(settles()).toBe(0);
    await tick(REDUCED_MS / 2);
    expect(settles()).toBe(1);
    await tick(REDUCED_MS + END_MARGIN_MS);
    expect(building()).toBeNull();
    expect(today()).toMatch(/completed/);
  });
});

describe('a stone is set, by day', () => {
  beforeEach(() => usePreferences.setState({ theme: 'day' }));
  const pebbleIn = () => screen.queryByTestId('pebble-entering', HIDDEN);
  const pebbleCooling = () => screen.queryByTestId('pebble-cooling', HIDDEN);

  it('brings in the new pebble, and cools the one before it', async () => {
    const view = await show(OPEN);
    expect(pebbleIn()).toBeNull();
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    expect(pebbleIn()).toBeNull();
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    expect(pebbleIn()).not.toBeNull();
    expect(pebbleCooling()).not.toBeNull();
    await tick(PEBBLE_SETTLE_AT_MS);
    expect(settles()).toBe(1);
    await tick(DAY_END_MS + END_MARGIN_MS);
    expect(pebbleIn()).toBeNull();
    expect(pebbleCooling()).toBeNull();
    expect(PEBBLE_COOL_MS).toBeGreaterThan(0);
  });

  it('carries the pebbles already there half a step as the new one comes, so the row never jumps', async () => {
    const view = await show(OPEN);
    await keepAnEchoWhileAway(view, DONE);
    await sessionCloses();
    // Home as the person left it: three pebbles, centred, and no room held.
    expect(screen.queryAllByTestId('pebble-carried', HIDDEN)).toHaveLength(0);
    expect(screen.queryByTestId('pebble-room', HIDDEN)).toBeNull();
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    // The three that were there are carried into the places the fourth leaves them.
    expect(screen.queryAllByTestId('pebble-carried', HIDDEN)).toHaveLength(3);
    const carried = screen.getAllByTestId('pebble-carried', HIDDEN)[0];
    const style = StyleSheet.flatten(carried?.props.style) as {
      transform: { translateX: number }[];
    };
    // It starts half a step (one pebble) to the right, where the pebble was before the row grew.
    expect(style.transform[0]?.translateX).toBe(11);
    await tick(DAY_END_MS + END_MARGIN_MS);
    expect(screen.queryAllByTestId('pebble-carried', HIDDEN)).toHaveLength(0);
  });

  it('leaves the pebbles alone for a second echo the same day', async () => {
    const view = await show(DONE);
    await begin();
    await tick(DISSOLVE_MS);
    await fireEvent.press(screen.getByTestId('opened'));
    await showAgain(view, SECOND);
    await sessionCloses();
    await tick(ARRIVAL_AFTER_IDLE_MS + HOLD_MS);
    expect(pebbleIn()).toBeNull();
    expect(settles()).toBe(0);
  });
});

describe('the welcome', () => {
  beforeEach(() => {
    usePreferences.setState({ homeWelcomed: false });
    useOnboarding.setState({ completedAt: Date.now() });
  });

  it('builds the first cairn 900 ms after Home first appears, from an open outline', async () => {
    await show(FIRST);
    expect(today()).not.toMatch(/completed/);
    expect(count(1)).toBeNull();
    await tick(WELCOME_ARRIVAL_AT_MS - 1);
    expect(building()).toBeNull();
    await tick(1);
    expect(building()).not.toBeNull();
    expect(today()).toMatch(/completed/);
    await tick(SETTLE_AT_MS);
    expect(settles()).toBe(1);
    await tick(NIGHT_END_MS + END_MARGIN_MS);
    expect(building()).toBeNull();
    expect(count(1)).not.toBeNull();
  });

  it('is marked as welcomed the moment Home first appears, whether it plays or not', async () => {
    await show(FIRST);
    expect(usePreferences.getState().homeWelcomed).toBe(true);
  });

  it('never plays twice: Home only welcomes once', async () => {
    const view = await show(FIRST);
    await tick(WELCOME_ARRIVAL_AT_MS);
    await tick(NIGHT_END_MS + END_MARGIN_MS);
    await view.unmount();
    useStoneMemory.getState().reset();
    await show(FIRST);
    await tick(10_000);
    expect(building()).toBeNull();
    expect(today()).toMatch(/completed/);
  });

  it('is not the welcome for someone whose onboarding finished a while ago', async () => {
    useOnboarding.setState({ completedAt: Date.now() - WELCOME_WINDOW_MS - 1000 });
    await show(FIRST);
    expect(today()).toMatch(/completed/);
    await tick(10_000);
    expect(building()).toBeNull();
    // It is still marked, so a later look is not the first either.
    expect(usePreferences.getState().homeWelcomed).toBe(true);
  });

  it('is not the welcome when it is not the day of the first echo', async () => {
    await show(OPEN);
    await tick(10_000);
    expect(building()).toBeNull();
    expect(today()).not.toMatch(/completed/);
  });

  it('is not the welcome when Home has welcomed before', async () => {
    usePreferences.setState({ homeWelcomed: true });
    await show(FIRST);
    expect(today()).toMatch(/completed/);
    await tick(10_000);
    expect(building()).toBeNull();
  });
});
