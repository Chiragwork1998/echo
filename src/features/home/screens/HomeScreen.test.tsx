import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Dimensions } from 'react-native';

import { copy } from '@/content/copy';
import { goldenCopy } from '@/content/goldenCopy';
import {
  createMemoryJournal,
  setJournal,
  useHomeSummary,
  type Entry,
  type HomeSummary,
  type Rhythm,
} from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';
import { usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { homeLabels } from '../today/homeLabels';
import { HomeScreen } from './HomeScreen';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  usePathname: () => '/home',
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

  it('links the avatar to You', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(copy.home.tabs[3]));
    expect(router.navigate).toHaveBeenCalledWith('/home/you');
  });

  it('offers the latest entry in the card slot when nothing is in progress', async () => {
    seed(...WEEK, entry('recent', '2026-11-04', { ...RECENT, committedAt: AT + 10 }));
    await render(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(RECENT.title)).toBeTruthy());
    expect(screen.getByText(`${homeLabels.yesterday} · ${homeLabels.minutes(6)}`)).toBeTruthy();
    await fireEvent.press(button(new RegExp(RECENT.title)));
    expect(router.navigate).toHaveBeenCalledWith({
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
    expect(router.navigate).toHaveBeenCalledWith({
      pathname: '/home/echoes',
      params: { entryId: 'recent' },
    });
  });

  it('sends See all to Echoes', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(button(goldenCopy.seeAll));
    expect(router.navigate).toHaveBeenCalledWith('/home/echoes');
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
