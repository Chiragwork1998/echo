import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { goldenCopy } from '@/content/goldenCopy';
import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import {
  createMemoryJournal,
  setJournal,
  useHomeSummary,
  type Entry,
  type HomeSummary,
  type Rhythm,
} from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';
import { useOnboarding } from '@/state/onboarding';
import { usePreferences } from '@/state/preferences';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { noteShownPlate, resetPlatesForTests } from '@/design/platePaint';

import { ARRIVAL_AFTER_IDLE_MS, HomeDissolveProvider, VEIL_CAP_MS } from '../dissolve';
import { homeLabels } from '../today/homeLabels';
import { useStoneMemory } from '../today/stoneMemory';
import { HomeScreen, PAGE_ARRIVED_MS } from './HomeScreen';

jest.mock('@/design/haptics');
let mockPath = '/home';
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  usePathname: () => mockPath,
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
// Evening, whatever the hour the tests run: the morning question is tested in become.test.tsx.
jest.mock('@/features/become/morning', () => ({
  ...jest.requireActual('@/features/become/morning'),
  useMorning: () => false,
}));
jest.mock('@/features/journal', () => {
  const actual = jest.requireActual('@/features/journal');
  return { ...actual, useHomeSummary: jest.fn(actual.useHomeSummary) };
});

const actualSummary = jest.requireActual('@/features/journal').useHomeSummary;
const mockedSummary = useHomeSummary as jest.MockedFunction<typeof useHomeSummary>;

// A Thursday, as in the goldens.
const NOW = new Date(2026, 10, 5, 9, 41);
const clock = { now: () => NOW, localDay: deviceClock.localDay };
const AT = NOW.getTime();

const entry = (id: string, day: string, patch: Partial<Entry> = {}): Entry => ({
  id,
  status: 'committed',
  title: '',
  body: 'Some words',
  mode: 'text',
  durationSeconds: 360,
  createdAt: AT,
  updatedAt: AT,
  committedAt: AT,
  localDay: day,
  ...patch,
});

const WEEK = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((day, i) =>
  entry(`e${i}`, day, { committedAt: AT + i }),
);
const RECENT = {
  title: 'The weight I didn’t name',
  body: 'Sometimes the heaviest things live in the quietest corners.',
  durationSeconds: 360,
};
const DRAFT: Entry = entry('draft-1', '', {
  status: 'draft',
  title: 'I keep returning to…',
  durationSeconds: 300,
  committedAt: undefined,
  localDay: undefined,
});

const seed = (...entries: Entry[]) => setJournal(createMemoryJournal({ entries }, clock));

function setWindow(fontScale = 1) {
  const metrics = { width: 393, height: 852, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

const week = (done: number): Rhythm['week'] =>
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((weekday, i) => ({
    day: `2026-11-0${2 + i}`,
    weekday: weekday as Rhythm['week'][number]['weekday'],
    completed: i < done,
    isToday: i === 3,
  }));

const summary = (patch: Partial<HomeSummary>): HomeSummary => ({
  status: 'ready',
  rhythm: {
    today: '2026-11-05',
    week: week(0),
    weekReflections: 0,
    currentStreak: 0,
    totalDays: 0,
    totalReflections: 0,
  },
  recent: null,
  continueDraft: null,
  error: null,
  refresh: jest.fn(async () => undefined),
  ...patch,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/home';
  useStoneMemory.getState().reset();
  mockedSummary.mockImplementation(actualSummary);
  usePreferences.setState({ theme: 'night' });
  setWindow();
  seed(...WEEK, entry('recent', '2026-11-04', { ...RECENT, committedAt: AT + 10 }), DRAFT);
});
afterEach(() => setJournal(null));

const button = (name: string | RegExp) => screen.getByRole('button', { name });

describe('Home, Night', () => {
  it('shows the Living Landscape composition from real data', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('header', { name: copy.home.nightHeadline })).toBeTruthy();
    expect(screen.getByText(copy.home.nightSubtitle)).toBeTruthy();
    expect(button(`${goldenCopy.nightBegin}. ${goldenCopy.nightBeginArc}`)).toBeTruthy();
    expect(button(goldenCopy.nightWriteInstead)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(goldenCopy.nightRhythm(5))).toBeTruthy());
    expect(screen.getByText(copy.home.thisWeek.toUpperCase())).toBeTruthy();
    expect(screen.getByText(copy.home.continueEcho.toUpperCase())).toBeTruthy();
    expect(screen.getByText(goldenCopy.minutesLeft(2))).toBeTruthy();
  });

  it('shows a draft past its seven minutes by its length, never as "0 min left"', async () => {
    seed(...WEEK, { ...DRAFT, durationSeconds: 9 * 60 + 20 });
    await render(<HomeScreen />);
    expect(await screen.findByText('9 min')).toBeTruthy();
    expect(screen.queryByText(goldenCopy.minutesLeft(0))).toBeNull();
  });

  it('draws seven days, and marks each completed day in words as well as shape', async () => {
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getAllByLabelText(/completed/)).toHaveLength(4));
    expect(screen.getByLabelText(/^Monday, completed/)).toBeTruthy();
    expect(screen.getByLabelText(/^Thursday, completed, Today/)).toBeTruthy();
    expect(screen.getByLabelText('Friday')).toBeTruthy();
    expect(screen.getByLabelText('Sunday')).toBeTruthy();
  });

  it('shows the time with the moon, and never a place', async () => {
    await render(<HomeScreen />);
    expect(screen.getByLabelText(new RegExp(`^${homeLabels.localTime} `))).toBeTruthy();
    expect(screen.queryByText(/Spiti/)).toBeNull();
  });

  it('begins a session from the stone, and a written one from Write instead', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(`${goldenCopy.nightBegin}. ${goldenCopy.nightBeginArc}`));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice' },
    });
    await fireEvent.press(button(goldenCopy.nightWriteInstead));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'write' },
    });
  });

  it('cues a commit from the stone and a tick from each pill beside it', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(`${goldenCopy.nightBegin}. ${goldenCopy.nightBeginArc}`));
    expect(jest.mocked(cue).mock.calls).toEqual([['commit']]);
    await fireEvent.press(screen.getByTestId('home-breathe-first'));
    await fireEvent.press(button(goldenCopy.nightWriteInstead));
    expect(jest.mocked(cue).mock.calls).toEqual([['commit'], ['tick'], ['tick']]);
  });

  it('continues the draft from its card', async () => {
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('I keep returning to…')).toBeTruthy());
    await fireEvent.press(button(/I keep returning to/));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { draftId: 'draft-1' },
    });
  });

  // After ECHO closed mid-take, the rescued recording waits in this draft, and the card is the way
  // back to it. It opens spoken, as Begin does, where "Turn my voice into words" is offered.
  it('continues a draft whose recording has no words yet where that recording is offered', async () => {
    const rescued = { id: 'a1', extension: '.aac', durationSeconds: null, recovered: true };
    seed(...WEEK, { ...DRAFT, title: '', body: '', mode: 'voice', audio: rescued });
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /Voice echo/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { draftId: 'draft-1', mode: 'voice' },
    });
  });

  it('continues a draft whose recording is already words in it as any other draft', async () => {
    const heard = { id: 'a1', extension: '.aac', durationSeconds: 40, recovered: false };
    seed(...WEEK, { ...DRAFT, mode: 'voice', audio: heard, transcribedAudioId: 'a1' });
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /I keep returning to/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { draftId: 'draft-1' },
    });
  });

  // A morning draft answered "Who will you be today?". It comes back to the same question, and
  // rehearses after Reflect, whenever it is continued. Arrive is not asked again.
  it('continues a morning draft with the morning question', async () => {
    seed(...WEEK, { ...DRAFT, promptId: 'become' });
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /I keep returning to/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { draftId: 'draft-1', prompt: 'become' },
    });
  });

  it('links the avatar to You', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(copy.home.tabs[3]));
    expect(router.push).toHaveBeenCalledWith('/home/you');
  });

  it('offers the latest entry in the card slot when nothing is in progress', async () => {
    seed(...WEEK, entry('recent', '2026-11-04', { ...RECENT, committedAt: AT + 10 }));
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(RECENT.title)).toBeTruthy());
    expect(screen.getByText(`${homeLabels.yesterday} · ${homeLabels.minutes(6)}`)).toBeTruthy();
    await fireEvent.press(button(new RegExp(RECENT.title)));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/echoes',
      params: { entryId: 'recent' },
    });
  });

  it('greets a first-time user with the empty state, and no Continue card', async () => {
    seed();
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(homeLabels.emptyRecent)).toBeTruthy());
    expect(screen.queryByText(copy.home.continueEcho.toUpperCase())).toBeNull();
    expect(screen.queryByText(/reflections/)).toBeNull();
  });

  it('waits quietly while loading, without claiming the journal is empty', async () => {
    mockedSummary.mockReturnValue(summary({ status: 'loading' }));
    await render(<HomeScreen />);
    expect(screen.getByLabelText(homeLabels.loading)).toBeTruthy();
    expect(screen.queryByText(homeLabels.emptyRecent)).toBeNull();
    expect(button(`${goldenCopy.nightBegin}. ${goldenCopy.nightBeginArc}`)).toBeTruthy();
  });

  it('keeps the scene on an error and offers a retry', async () => {
    const refresh = jest.fn(async () => undefined);
    mockedSummary.mockReturnValue(
      summary({ status: 'error', error: { code: 'read_failed', retryable: true }, refresh }),
    );
    await render(<HomeScreen />);
    expect(screen.getByText(homeLabels.loadError)).toBeTruthy();
    expect(button(goldenCopy.nightWriteInstead)).toBeTruthy();
    await fireEvent.press(button(homeLabels.retry));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows an unreadable entry as unopenable rather than hiding it', async () => {
    mockedSummary.mockReturnValue(
      summary({
        recent: {
          id: 'x',
          status: 'committed',
          readable: false,
          title: '',
          preview: '',
          mode: 'text',
          durationSeconds: 0,
          hasAudio: false,
          recovered: false,
          createdAt: AT,
          updatedAt: AT,
          localDay: '2026-11-04',
        },
      }),
    );
    await render(<HomeScreen />);
    const card = button(new RegExp(homeLabels.unreadable));
    expect(card).toBeDisabled();
    await fireEvent.press(card);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('names a voice-only draft by its kind', async () => {
    seed(entry('v', '', { status: 'draft', body: '', mode: 'voice', committedAt: undefined }));
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(homeLabels.voiceEcho)).toBeTruthy());
  });

  it('uses the scrolling accessible layout at 150% text', async () => {
    setWindow(1.5);
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('I keep returning to…')).toBeTruthy());
    expect(screen.getByText('I keep returning to…').props.numberOfLines).toBe(3);
  });
});

describe('Home beneath another screen', () => {
  // On Android the session, Rehearse and Completion are presented over Home, which stays up beneath them,
  // and Completion gives Home its interface back while it is still on show.
  it('is reached by neither a touch nor TalkBack while Completion covers it', async () => {
    mockPath = '/home/complete';
    await render(<HomeScreen />);
    const begin = `${goldenCopy.nightBegin}. ${goldenCopy.nightBeginArc}`;
    expect(screen.queryByRole('button', { name: begin })).toBeNull();
    const hidden = screen.getByRole('button', { name: begin, includeHiddenElements: true });
    // The layer that holds the interface lets no touch through to it.
    let node: typeof hidden | null = hidden;
    let blocked = false;
    while (node) {
      if (node.props.pointerEvents === 'none') blocked = true;
      node = node.parent;
    }
    expect(blocked).toBe(true);
  });

  it('is itself again once it is the screen on show', async () => {
    mockPath = '/home/complete';
    const view = await render(<HomeScreen />);
    mockPath = '/home';
    await view.rerender(
      <ThemeProvider crossfade={false}>
        <HomeScreen />
      </ThemeProvider>,
    );
    expect(button(`${goldenCopy.nightBegin}. ${goldenCopy.nightBeginArc}`)).toBeTruthy();
  });
});

describe('Home, Day', () => {
  beforeEach(() => usePreferences.setState({ theme: 'day' }));

  it('shows Valley Morning with its own words', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText(copy.home.dayGreeting)).toBeTruthy();
    expect(screen.getByRole('header', { name: copy.home.dayHeadline })).toBeTruthy();
    expect(screen.getByText(goldenCopy.dayHomeSubtitle)).toBeTruthy();
    expect(screen.getByText(copy.home.eyebrow.toUpperCase())).toBeTruthy();
    expect(screen.getByText(copy.home.prompt)).toBeTruthy();
    expect(screen.queryByText(goldenCopy.nightBegin)).toBeNull();
  });

  it('labels the rhythm with the current streak', async () => {
    await render(<HomeScreen />);
    await waitFor(() =>
      expect(screen.getByText(goldenCopy.dayRhythm(4).toUpperCase())).toBeTruthy(),
    );
  });

  it('begins today’s echo from the cream CTA', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(copy.home.begin));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'voice' },
    });
  });

  it('cues a commit from the cream CTA and a tick from each link under it', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(copy.home.begin));
    expect(jest.mocked(cue).mock.calls).toEqual([['commit']]);
    await fireEvent.press(screen.getByTestId('home-breathe-first'));
    await fireEvent.press(button(goldenCopy.dayWriteInstead));
    expect(jest.mocked(cue).mock.calls).toEqual([['commit'], ['tick'], ['tick']]);
  });

  it('offers Write instead under the CTA, and opens the session in Write', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(goldenCopy.dayWriteInstead));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/session',
      params: { mode: 'write' },
    });
    expect(router.push).not.toHaveBeenCalledWith('/home/session');
  });

  it('shows From your path with the latest entry, and opens it in Echoes', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('header', { name: copy.home.recentTitle })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(RECENT.title)).toBeTruthy());
    expect(
      screen.getByText(`${homeLabels.yesterday} · ${homeLabels.minutes(6)}`.toUpperCase()),
    ).toBeTruthy();
    await fireEvent.press(button(new RegExp(RECENT.title)));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/home/echoes',
      params: { entryId: 'recent' },
    });
  });

  it('sends See all to Echoes', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(goldenCopy.seeAll));
    expect(router.push).toHaveBeenCalledWith('/home/echoes');
  });

  it('reads “Your first echo will appear here.” before there is an entry', async () => {
    seed();
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(homeLabels.emptyRecent)).toBeTruthy());
    expect(screen.queryByText(/day rhythm/i)).toBeNull();
  });

  it('shows an inline retry on error and keeps the scene', async () => {
    const refresh = jest.fn(async () => undefined);
    mockedSummary.mockReturnValue(
      summary({ status: 'error', error: { code: 'read_failed', retryable: true }, refresh }),
    );
    await render(<HomeScreen />);
    expect(screen.getByText(homeLabels.loadError)).toBeTruthy();
    expect(screen.getByText(copy.home.dayHeadline)).toBeTruthy();
    await fireEvent.press(button(homeLabels.retry));
    expect(refresh).toHaveBeenCalled();
  });
});

describe('theme changes', () => {
  it('swap the composition without remounting the scroll view or the data', async () => {
    await render(<HomeScreen />);
    const scroll = screen.getByTestId('home-scroll');
    const calls = mockedSummary.mock.calls.length;
    await act(async () => usePreferences.setState({ theme: 'day' }));
    expect(screen.getByText(copy.home.dayHeadline)).toBeTruthy();
    expect(screen.getByTestId('home-scroll')).toBe(scroll);
    await act(async () => usePreferences.setState({ theme: 'night' }));
    expect(screen.getByText(copy.home.nightHeadline)).toBeTruthy();
    expect(screen.getByTestId('home-scroll')).toBe(scroll);
    expect(mockedSummary.mock.calls.length).toBeGreaterThan(calls);
  });
});

// Home's first look after onboarding (the walk, v11, both welcomes): Home's interface came with its
// photograph, but its card was empty glass for a frame, and then the card. Home mounts there with the
// journal still being read, and the card arrived: its glass whole at once, its words faded in on it.
describe('Home’s card on Home’s first look', () => {
  const TITLE = 'The weight I didn’t name';
  const answer = (): HomeSummary =>
    summary({
      rhythm: {
        today: '2026-11-05',
        week: week(0).map((day) => (day.isToday ? { ...day, completed: true } : day)),
        weekReflections: 1,
        currentStreak: 1,
        totalDays: 1,
        totalReflections: 1,
      },
      recent: {
        id: 'first',
        status: 'committed',
        readable: true,
        title: TITLE,
        preview: '',
        mode: 'text',
        durationSeconds: 60,
        hasAudio: false,
        recovered: false,
        createdAt: AT,
        updatedAt: AT,
        localDay: '2026-11-05',
      },
    });
  type Json = { props: Record<string, unknown>; children?: (Json | string)[] | null };
  /**
   * How much of the card's glass is drawn, and how much of the words on it, from what is drawn: each the
   * product of the opacities above it. Null while the card is not there at all.
   */
  function card(): { glass: number; words: number } | null {
    const blurs = new Map<Json, number>();
    let words: { drawn: number; above: Json[] } | null = null;
    const walk = (node: unknown, drawn: number, above: Json[]): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach((child) => walk(child, drawn, above));
      const json = node as Json;
      const own = (
        StyleSheet.flatten(json.props.style as never) as { opacity?: number } | undefined
      )?.opacity;
      const here = drawn * (own ?? 1);
      // A piece of glass is what expo-blur draws, which under jest names its blur method.
      if ('blurMethod' in json.props && above.length) blurs.set(above[above.length - 1]!, here);
      if (json.children?.some((child) => typeof child === 'string' && child.includes(TITLE))) {
        words = { drawn: here, above };
      }
      walk(json.children, here, [...above, json]);
    };
    walk(screen.toJSON(), 1, []);
    const found = words as { drawn: number; above: Json[] } | null;
    if (!found) return null;
    const glass = [...found.above].reverse().find((node) => blurs.has(node));
    return { glass: glass ? (blurs.get(glass) ?? 0) : 0, words: found.drawn };
  }
  let current: HomeSummary;
  const advance = (ms: number) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  const draw = (view: Awaited<ReturnType<typeof render>>) =>
    view.rerender(
      <ThemeProvider crossfade={false}>
        <HomeScreen />
      </ThemeProvider>,
    );

  beforeEach(() => {
    jest.useFakeTimers();
    // What arrives is walked, a frame at a time, so that every frame of it can be looked at.
    animationClock.stepped = true;
    // The welcome: onboarding has only just finished, and Home has not welcomed before.
    useOnboarding.setState({ completedAt: Date.now() });
    usePreferences.setState({ homeWelcomed: false });
    current = summary({ status: 'loading' });
    mockedSummary.mockImplementation(() => current);
  });
  afterEach(async () => {
    // Before the clock is given back: what unmounts clears timers of its own.
    await screen.unmount();
    animationClock.reset();
    jest.useRealTimers();
  });

  it.each([
    ['answers before a skeleton would be drawn', 100],
    ['outlasts the skeleton’s quarter of a second', 600],
  ])('is never empty glass when the first read %s', async (_when, ms) => {
    const view = await render(<HomeScreen />);
    await advance(ms);
    await draw(view);
    expect(card()).toBeNull();
    current = answer();
    await draw(view);
    // The card is there, whole, its words on its glass, from the first frame it is drawn.
    expect(card()).toEqual({ glass: 1, words: 1 });
    for (let frame = 0; frame < 30; frame += 1) {
      await advance(16);
      await draw(view);
      const now = card();
      if (now && now.glass > 0) expect(now.words).toBeCloseTo(now.glass, 5);
    }
    expect(card()).toEqual({ glass: 1, words: 1 });
  });
});

// The welcome (the walk, v11): Home's interface cut in on its first frame, after a frame of Completion's
// photograph with nothing on it. Completion now lets its interface go first, Home's photograph comes up
// over Completion's, and Home's interface rises once Home is ready to be seen.
describe('Home’s first look after onboarding, which begins veiled', () => {
  const BEGIN = `${goldenCopy.nightBegin}. ${goldenCopy.nightBeginArc}`;
  let current: HomeSummary;
  const ui = (veiled: boolean) => (
    <HomeDissolveProvider veiled={veiled}>
      <HomeScreen />
    </HomeDissolveProvider>
  );
  const advance = (ms: number) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  const draw = (view: Awaited<ReturnType<typeof render>>, veiled = true) =>
    view.rerender(<ThemeProvider crossfade={false}>{ui(veiled)}</ThemeProvider>);
  type Node = { props: { style?: unknown }; parent: Node | null };
  /** How much of Home's interface is drawn: everything above its Begin, multiplied. */
  const interfaceDrawn = () => {
    let node = screen.getByRole('button', {
      name: BEGIN,
      includeHiddenElements: true,
    }) as unknown as Node | null;
    let drawn = 1;
    while (node) {
      const own = (
        StyleSheet.flatten(node.props.style as never) as { opacity?: number } | undefined
      )?.opacity;
      drawn *= own ?? 1;
      node = node.parent;
    }
    return drawn;
  };
  /** Home's first frame: it is laid out, and the UI thread runs a frame after that. */
  const firstFrame = async () => {
    await act(async () => {
      fireEvent(screen.getByTestId('home-screen', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 852 } },
      });
    });
    await advance(16);
  };
  const photographUp = () => act(async () => noteShownPlate('home-plate', 'night', 'home'));

  beforeEach(() => {
    jest.useFakeTimers();
    resetPlatesForTests();
    // Completion's photograph is the one on show as Home mounts.
    noteShownPlate('completion-plate', 'night', 'completion');
    current = summary({ status: 'loading' });
    mockedSummary.mockImplementation(() => current);
  });
  afterEach(async () => {
    // Before the clock is given back: what unmounts clears timers of its own.
    await screen.unmount();
    resetPlatesForTests();
    jest.useRealTimers();
  });

  it('begins with its interface gone, out of reach of a touch and of TalkBack', async () => {
    await render(ui(true));
    expect(interfaceDrawn()).toBe(0);
    expect(screen.queryByRole('button', { name: BEGIN })).toBeNull();
  });

  it('rises once it has drawn its first frame, its first read has answered and its photograph is up', async () => {
    const view = await render(ui(true));
    await firstFrame();
    current = summary({ status: 'ready' });
    await draw(view);
    await advance(100);
    await draw(view);
    // Not over Completion's photograph: it waits for its own.
    expect(screen.queryByRole('button', { name: BEGIN })).toBeNull();
    await photographUp();
    await advance(16);
    await draw(view);
    // Rising, long before the cap: it is in reach as soon as it begins to.
    expect(screen.getByRole('button', { name: BEGIN })).toBeTruthy();
    await advance(ARRIVAL_AFTER_IDLE_MS);
    await draw(view);
    expect(interfaceDrawn()).toBe(1);
    expect(screen.getByRole('button', { name: BEGIN })).toBeTruthy();
  });

  it('waits for its first read, so that its card is whole when it is seen', async () => {
    const view = await render(ui(true));
    await firstFrame();
    await photographUp();
    await advance(VEIL_CAP_MS - 400);
    await draw(view);
    expect(screen.queryByRole('button', { name: BEGIN })).toBeNull();
    current = summary({ status: 'ready' });
    await draw(view);
    await advance(16);
    await draw(view);
    // Before the cap: the answer is what it waited for.
    expect(screen.getByRole('button', { name: BEGIN })).toBeTruthy();
  });

  it('is never left veiled: whatever it waits for, its interface rises by the cap', async () => {
    const view = await render(ui(true));
    // Its photograph never reports itself, and its read never answers.
    await advance(VEIL_CAP_MS - 1);
    await draw(view);
    expect(screen.queryByRole('button', { name: BEGIN })).toBeNull();
    await advance(1);
    await advance(ARRIVAL_AFTER_IDLE_MS);
    await draw(view);
    expect(interfaceDrawn()).toBe(1);
    expect(screen.getByRole('button', { name: BEGIN })).toBeTruthy();
  });

  it('is Home as it always was when it does not begin veiled: whole, and in reach, from its first frame', async () => {
    current = summary({ status: 'ready' });
    await render(ui(false));
    expect(interfaceDrawn()).toBe(1);
    expect(screen.getByRole('button', { name: BEGIN })).toBeTruthy();
  });
});

describe('Home under a page', () => {
  // The tab pages are presented over Home and cover it with a plate of their own. One replacing another
  // fades out as the next fades in, and Home's interface must not show through between them.
  const advance = (ms: number) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  const draw = (view: Awaited<ReturnType<typeof render>>) =>
    view.rerender(
      <ThemeProvider crossfade={false}>
        <HomeScreen />
      </ThemeProvider>,
    );
  const present = () =>
    (
      StyleSheet.flatten(
        screen.getByTestId('home-step-back', { includeHiddenElements: true }).props.style,
      ) as { opacity?: number }
    ).opacity ?? 1;

  beforeEach(() => {
    jest.useFakeTimers();
    animationClock.stepped = true;
  });
  afterEach(async () => {
    await screen.unmount();
    animationClock.reset();
    jest.useRealTimers();
  });

  it('stays whole beneath a page that arrives over it, and beneath it at rest', async () => {
    const view = await render(<HomeScreen />);
    expect(present()).toBe(1);
    mockPath = '/home/echoes';
    await draw(view);
    await advance(PAGE_ARRIVED_MS * 2);
    await draw(view);
    expect(present()).toBe(1);
  });

  it('steps back while one page gives way to another, and is whole again once the new one has arrived', async () => {
    mockPath = '/home/echoes';
    const view = await render(<HomeScreen />);
    await advance(PAGE_ARRIVED_MS + 40);
    mockPath = '/home/patterns';
    await draw(view);
    await advance(16);
    await draw(view);
    expect(present()).toBe(0);
    await advance(PAGE_ARRIVED_MS);
    await draw(view);
    expect(present()).toBe(1);
  });

  it('is whole the moment Today is chosen, even in the middle of a swap', async () => {
    mockPath = '/home/echoes';
    const view = await render(<HomeScreen />);
    mockPath = '/home/you';
    await draw(view);
    await advance(16);
    mockPath = '/home';
    await draw(view);
    await advance(16);
    await draw(view);
    expect(present()).toBe(1);
  });

  it.each(['/home/session', '/home/rehearse', '/home/complete', '/home/breathe'])(
    'leaves its interface to the dissolve under %s',
    async (path) => {
      const view = await render(<HomeScreen />);
      mockPath = path;
      await draw(view);
      await advance(PAGE_ARRIVED_MS * 3);
      await draw(view);
      expect(present()).toBe(1);
    },
  );
});
