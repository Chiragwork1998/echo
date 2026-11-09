import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { withTiming } from 'react-native-reanimated';

import { copy } from '@/content/copy';
import {
  createMemoryJournal,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import { emptyContent } from '@/features/journal/content';
import type { Entry } from '@/features/journal/types';
import { ImmersiveSession } from '@/features/journal-session/ImmersiveSession';
import { JournalSession } from '@/features/journal-session/JournalSession';
import { useSessionController } from '@/features/journal-session/useSessionController';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { resetPreferences, usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { bookCopy } from './bookCopy';
import { PAGE_TEXT } from './Pages';
import { FULL, HURRY_MS, SHORT } from './ritual';
import { CHOOSE_AT_MS } from './Shelf';
import { VOLUMES } from './volumes';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn() },
    Stack: { Screen: () => null },
    usePathname: () => '/home/session',
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-reanimated', () => {
  const stand = jest.requireActual('@/testing/reanimatedMock').reanimatedMock;
  return {
    ...stand,
    // Resolves to its end at once, as in every other test (and runs its callback when its time has passed), and remembers how it was asked to.
    withTiming: jest.fn(stand.withTiming),
    useAnimatedKeyboard: () => ({ height: { get: () => 0 }, state: { get: () => 0 } }),
  };
});
// Motion is covered by eye. By default the book arrives and opens at once, which is what Reduce Motion
// does. The ritual's timing is tested with it off.
let mockReduced = true;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));

const BODY = 'something I have carried';
let journal: Journal;

beforeEach(() => {
  mockReduced = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetPreferences();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  journal = createMemoryJournal({ entries: [] });
  setJournal(journal);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => true);
  jest.mocked(useVoiceRecorder).mockImplementation(
    () =>
      ({
        available: true,
        state: 'idle',
        elapsedSeconds: 0,
        error: null,
        start: jest.fn(async () => null),
        stop: jest.fn(async () => ({ ok: true, value: { durationSeconds: 3 } })),
        cancel: jest.fn(),
      }) as unknown as ReturnType<typeof useVoiceRecorder>,
  );
});
afterEach(() => {
  setJournal(null);
  jest.useRealTimers();
});

const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
/**
 * The book has been laid out and the UI thread has run its first frame. On a device the book says so itself, and
 * the shelf (which is kept until then) goes; under jest nothing lays anything out, so a test that wants the shelf
 * to go says it.
 */
const drawBook = async () => {
  await fireEvent(screen.getByTestId('book-stage', { includeHiddenElements: true }), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 355, height: 416 } },
  });
  await tick(60);
};
const shelf = () => screen.queryByTestId('book-shelf', { includeHiddenElements: true });
const volume = (id: string) => {
  const index = VOLUMES.findIndex((v) => v.id === id);
  const title = VOLUMES[index]!.title;
  return screen.getByRole('button', { name: bookCopy.volume(title, index + 1, VOLUMES.length) });
};
const field = (label: string) => screen.getByLabelText(label);

describe('First Echo at the shelf', () => {
  it('shows every volume as a button with its name, and no gesture is needed to choose one', async () => {
    await render(<JournalSession variant="onboarding" />);
    expect(screen.getAllByRole('button', { name: /, volume \d of 8$/ })).toHaveLength(8);
    // The journal is where the shelf rests, and a screen reader chooses with one press.
    expect(volume('your-echo').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.queryByLabelText(copy.firstEcho.title)).toBeNull();
  });

  it('opens the chosen book on a page that keeps the heading, and remembers the volume', async () => {
    await render(<JournalSession variant="onboarding" />);
    await fireEvent.press(volume('tides'));
    await tick(400);
    await drawBook();
    await tick(400);
    // The shelf is gone, and the page carries the question as its heading.
    expect(screen.queryAllByRole('button', { name: /, volume \d of 8$/ })).toHaveLength(0);
    expect(screen.getByRole('header', { name: copy.firstEcho.title })).toBeTruthy();
    expect(screen.getByText('EBB AND FLOW', { includeHiddenElements: true })).toBeTruthy();
    expect(usePreferences.getState().volume).toBe('tides');
    // Its header, with the step and the timer, stays.
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('writes through the same draft, and Reflect waits for the entry to be kept', async () => {
    await render(<JournalSession variant="onboarding" initialMode="write" />);
    await fireEvent.press(volume('your-echo'));
    await tick(400);
    const input = field(copy.firstEcho.title);
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.importantForAutofill).toBe('no');
    await waitFor(() => expect(field(copy.firstEcho.title).props.editable).toBe(true));
    await fireEvent.changeText(field(copy.firstEcho.title), BODY);
    expect(field(copy.firstEcho.title).props.value).toBe(BODY);

    expect(router.navigate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: copy.firstEcho.cta }));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1));
  });

  it('brings the book as the shelf leaves, and keeps the shelf until the book has drawn', async () => {
    mockReduced = false;
    await render(<JournalSession variant="onboarding" />);
    // The shelf rolls to the person's volume, and a touch on the centred one chooses it.
    await tick(3300);
    await fireEvent.press(volume('your-echo'));
    await tick(CHOOSE_AT_MS + 20);
    // The book is mounted, and the shelf is still there with it: no frame of neither.
    expect(screen.queryByTestId('book-stage', { includeHiddenElements: true })).toBeTruthy();
    expect(shelf()).toBeTruthy();
    await drawBook();
    await tick(400);
    expect(screen.queryByTestId('book-stage', { includeHiddenElements: true })).toBeTruthy();
    expect(shelf()).toBeNull();
  });

  it('keeps the shelf on screen at every frame until the book has drawn its first frame, however long that takes', async () => {
    mockReduced = false;
    await render(<JournalSession variant="onboarding" />);
    await tick(3300);
    await fireEvent.press(volume('your-echo'));
    // The walked emulator took half a second to draw the book, and 0.12 s the next time, while the shelf's own
    // fade (320 ms, on the UI thread) ended: the screen was empty and navy. Here it takes four seconds.
    for (let waited = 0; waited < 4000; waited += 16) {
      await tick(16);
      expect(shelf()).toBeTruthy();
    }
    await drawBook();
    await tick(400);
    expect(shelf()).toBeNull();
    expect(screen.queryByTestId('book-stage', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps it under Reduce Motion too: the book is asked for at once, and the shelf is not taken from under it', async () => {
    await render(<JournalSession variant="onboarding" />);
    await fireEvent.press(volume('your-echo'));
    await tick(400);
    expect(screen.queryByTestId('book-stage', { includeHiddenElements: true })).toBeTruthy();
    for (let waited = 0; waited < 2000; waited += 16) {
      await tick(16);
      expect(shelf()).toBeTruthy();
    }
    await drawBook();
    await tick(400);
    expect(shelf()).toBeNull();
  });

  it('skips the shelf when a draft is being continued', async () => {
    await journal.saveDraft('d1', emptyContent({ body: BODY }));
    await render(<JournalSession variant="onboarding" />);
    await waitFor(() => expect(field(copy.firstEcho.title).props.value).toBe(BODY));
    expect(screen.queryAllByRole('button', { name: /, volume \d of 8$/ })).toHaveLength(0);
  });

  it('draws neither shelf nor book until it knows, and never the studio for a draft being continued', async () => {
    await journal.saveDraft('d1', emptyContent({ body: BODY }));
    // The draft is read slowly, as from a phone's sealed store on a cold start.
    let open = () => undefined as void;
    const read = new Promise<void>((resolve) => (open = resolve));
    const slow: Journal = { ...journal, latestDraft: () => read.then(() => journal.latestDraft()) };
    setJournal(slow);
    await render(<JournalSession variant="onboarding" />);
    const studio = () =>
      StyleSheet.flatten(
        screen.getByTestId('shelf-backdrop', { includeHiddenElements: true }).props.style,
      ).opacity;
    // Walk v10: the opaque studio and the shelf were drawn over the photograph, then taken away.
    expect(studio()).toBe(0);
    expect(shelf()).toBeNull();
    expect(screen.queryByTestId('book-stage', { includeHiddenElements: true })).toBeNull();

    await act(async () => open());
    await waitFor(() => expect(field(copy.firstEcho.title).props.value).toBe(BODY));
    expect(studio()).toBe(0);
    expect(shelf()).toBeNull();
  });

  it('brings the shelf in, over the photograph, once it knows the page is new', async () => {
    let open = () => undefined as void;
    const read = new Promise<void>((resolve) => (open = resolve));
    setJournal({ ...journal, latestDraft: () => read.then(() => journal.latestDraft()) });
    const view = await render(<JournalSession variant="onboarding" />);
    expect(shelf()).toBeNull();
    await act(async () => open());
    await waitFor(() => expect(shelf()).toBeTruthy());
    expect(screen.queryByTestId('book-stage', { includeHiddenElements: true })).toBeNull();
    // An animated style is read when the screen is next drawn.
    await view.rerender(
      <ThemeProvider crossfade={false}>
        <JournalSession variant="onboarding" />
      </ThemeProvider>,
    );
    expect(
      StyleSheet.flatten(
        screen.getByTestId('shelf-backdrop', { includeHiddenElements: true }).props.style,
      ).opacity,
    ).toBe(1);
  });

  it('keeps the book open when the page of a continued draft is emptied', async () => {
    await journal.saveDraft('d1', emptyContent({ body: BODY }));
    await render(<JournalSession variant="onboarding" initialMode="write" />);
    await waitFor(() => expect(field(copy.firstEcho.title).props.value).toBe(BODY));
    await waitFor(() => expect(field(copy.firstEcho.title).props.editable).toBe(true));
    await fireEvent.changeText(field(copy.firstEcho.title), '');
    expect(field(copy.firstEcho.title).props.value).toBe('');
    // Emptying the page is not choosing a book again.
    expect(screen.queryAllByRole('button', { name: /, volume \d of 8$/ })).toHaveLength(0);
    expect(shelf()).toBeNull();
    expect(screen.getByTestId('book-stage', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('the daily echo on vellum', () => {
  it('has no shelf: after the stillness the remembered book opens, with the words on its page', async () => {
    usePreferences.getState().setVolume('orbit');
    await render(<JournalSession variant="daily" initialMode="write" />);
    expect(screen.queryAllByRole('button', { name: /, volume \d of 8$/ })).toHaveLength(0);
    // No header, timer or progress: only the mountains and the page.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('header')).toBeNull();
    await tick(400);
    expect(screen.getByText('WIDER CIRCLES', { includeHiddenElements: true })).toBeTruthy();
    await waitFor(() => expect(field(copy.home.prompt).props.editable).toBe(true));
  });

  it('keeps the entry one string whatever page is showing, and turns with buttons or a swipe', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    await journal.saveDraft('d1', emptyContent({ body: long }));
    await render(<JournalSession variant="daily" draftId="d1" initialMode="write" />);
    await tick(400);
    await waitFor(() => expect(field(copy.home.prompt).props.value).toBe(long));
    // The text measures at thirty lines: more than a page.
    await fireEvent(screen.getByTestId('book-measure', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: PAGE_TEXT.line * 30 } },
    });
    await tick(400);
    const next = screen.getByTestId('book-next');
    const previous = screen.getByTestId('book-previous');
    const label = (n: number, of: number) => bookCopy.page.of(n, of);
    const pages = Number(
      /of (\d+)/.exec(screen.getByLabelText(/^Page \d+ of \d+$/).props.accessibilityLabel)?.[1],
    );
    expect(pages).toBeGreaterThan(1);
    // It opens at the end, where the newest words are.
    expect(screen.getByLabelText(label(pages, pages))).toBeTruthy();
    expect(next.props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.press(previous);
    await tick(400);
    expect(screen.getByLabelText(label(pages - 1, pages))).toBeTruthy();
    // Turning is only a change of view: every word is still there, in order.
    expect(field(copy.home.prompt).props.value).toBe(long);

    await fireEvent.press(screen.getByTestId('book-next'));
    await tick(400);
    expect(screen.getByLabelText(label(pages, pages))).toBeTruthy();
    expect(field(copy.home.prompt).props.value).toBe(long);
  });

  it('follows words that arrive by themselves, such as a transcript, to the newest page', async () => {
    await journal.saveDraft('d1', emptyContent({ body: 'a first take' }));
    await render(<JournalSession variant="daily" draftId="d1" initialMode="write" />);
    await tick(400);
    await waitFor(() => expect(field(copy.home.prompt).props.value).toBe('a first take'));
    // A second take arrives and is appended in order, past the end of the first page.
    const more = `a first take ${Array.from({ length: 80 }, (_, i) => `later${i}`).join(' ')}`;
    await fireEvent.changeText(field(copy.home.prompt), more);
    await fireEvent(screen.getByTestId('book-measure', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: PAGE_TEXT.line * 40 } },
    });
    await tick(400);
    const label = screen.getByLabelText(/^Page \d+ of \d+$/).props.accessibilityLabel as string;
    const [, at, of] = /Page (\d+) of (\d+)/.exec(label) ?? [];
    expect(Number(of)).toBeGreaterThan(1);
    expect(at).toBe(of);
    expect(field(copy.home.prompt).props.value).toBe(more);
  });
});

describe('the opening ritual (D-008)', () => {
  const editable = () => field(copy.home.prompt).props.editable;
  const total = (r: typeof FULL) => r.stillness + r.rise + r.cover;

  it('plays in full at first, and a tap anywhere finishes it at once', async () => {
    mockReduced = false;
    await render(<JournalSession variant="daily" initialMode="write" />);
    await tick(total(SHORT) + 200);
    // Not yet: the full ritual is longer than the short one.
    expect(editable()).toBe(false);
    await fireEvent.press(screen.getByTestId('session-scenery'));
    await tick(HURRY_MS + 50);
    expect(editable()).toBe(true);
    // The open page was reached without a cut: it is the same page, with the same words.
    expect(usePreferences.getState().bookOpens).toBe(1);
  });

  it('can be skipped during the stillness, before the book has begun to rise', async () => {
    mockReduced = false;
    await render(<JournalSession variant="daily" initialMode="write" />);
    await tick(200);
    expect(editable()).toBe(false);
    await fireEvent.press(screen.getByTestId('session-scenery'));
    await tick(HURRY_MS + 50);
    expect(editable()).toBe(true);
  });

  describe('with Reduce Motion switched on while ECHO is running', () => {
    // The system's answer comes after the first draw, which has read Reduce Motion as it was when the app
    // began: the book is drawn once as the full ritual and then again as a fade. It must open where it rests.
    // A new element each time, so that the screen is drawn again, as it is when the system answers.
    const session = () => (
      <ThemeProvider crossfade={false}>
        <JournalSession variant="daily" initialMode="write" />
      </ThemeProvider>
    );
    const stage = () =>
      StyleSheet.flatten(
        screen.getByTestId('book-stage', { includeHiddenElements: true }).props.style,
      );

    it('opens where it rests when the system answers as the next session begins', async () => {
      mockReduced = false;
      await render(session());
      mockReduced = true;
      await screen.rerender(session());
      expect(editable()).toBe(false);
      await tick(tokens.motion.fast + 50);
      expect(editable()).toBe(true);
      expect(stage().opacity).toBe(1);
      expect(stage().transform).toEqual([{ translateY: 0 }, { scale: 1 }]);
      expect(screen.queryByTestId('book-hinge', { includeHiddenElements: true })).toBeNull();
    });

    it('opens where it rests when it is switched on while the book is rising', async () => {
      mockReduced = false;
      await render(session());
      await tick(FULL.stillness + 400);
      expect(editable()).toBe(false);
      mockReduced = true;
      await screen.rerender(session());
      await tick(tokens.motion.fast + 50);
      expect(editable()).toBe(true);
      expect(stage().opacity).toBe(1);
      expect(stage().transform).toEqual([{ translateY: 0 }, { scale: 1 }]);
      expect(usePreferences.getState().bookOpens).toBe(1);
    });
  });

  it('is about half as long once the book has opened five times', async () => {
    mockReduced = false;
    usePreferences.setState({ bookOpens: 5 });
    await render(<JournalSession variant="daily" initialMode="write" />);
    // The stillness first, and then the book rises and its cover swings.
    await tick(SHORT.stillness + 10);
    await tick(SHORT.rise + SHORT.cover + 50);
    expect(editable()).toBe(true);
    expect(total(SHORT)).toBeLessThan(total(FULL) * 0.6);
    expect(usePreferences.getState().bookOpens).toBe(6);
  });

  it('keeps the words but shows an empty page when they are concealed', async () => {
    function Concealed() {
      const session = useSessionController({ variant: 'daily', initialMode: 'write' });
      return <ImmersiveSession session={session} page="vellum" concealed />;
    }
    await journal.saveDraft('d1', emptyContent({ body: BODY }));
    await render(<Concealed />);
    await tick(400);
    await waitFor(() =>
      expect(
        screen.getByLabelText(copy.home.prompt, { includeHiddenElements: true }).props.value,
      ).toBe(BODY),
    );
    // Hidden from the page, and from a screen reader, with no page count to give them away.
    expect(screen.queryByLabelText(copy.home.prompt)).toBeNull();
    expect(screen.queryByTestId('book-next')).toBeNull();
  });
});

describe('First Echo at the shelf: the studio and the book', () => {
  /** Every testID on the screen, in the order things are drawn: later is on top. */
  const order = () => {
    const ids: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const { props, children } = node as {
        props?: { testID?: string };
        children?: unknown[] | null;
      };
      if (props?.testID) ids.push(props.testID);
      children?.forEach(walk);
    };
    const tree = screen.toJSON();
    (Array.isArray(tree) ? tree : [tree]).forEach(walk);
    return ids;
  };
  const durations = () =>
    jest
      .mocked(withTiming)
      .mock.calls.map(([, config]) => (config as { duration?: number } | undefined)?.duration);

  it('draws the studio colour under the book, so a book coming forward is never seen through it', async () => {
    await render(<JournalSession variant="onboarding" />);
    await fireEvent.press(volume('your-echo'));
    await tick(400);
    const ids = order();
    expect(ids).toContain('shelf-backdrop');
    expect(ids).toContain('book-stage');
    expect(ids.indexOf('shelf-backdrop')).toBeLessThan(ids.indexOf('book-stage'));
  });

  it('clears the studio in a fade of at most 180 ms under Reduce Motion, and in 700 ms otherwise', async () => {
    await render(<JournalSession variant="onboarding" />);
    await fireEvent.press(volume('your-echo'));
    await tick(400);
    expect(durations()).toContain(180);
    expect(durations()).not.toContain(700);
  });

  it('keeps the studio\u2019s own 700 ms where nothing is asked to be quiet', async () => {
    mockReduced = false;
    await render(<JournalSession variant="onboarding" />);
    expect(durations()).toContain(700);
  });
});

describe('a book with echoes in it', () => {
  const echo = (n: number): Entry => ({
    ...emptyContent({ body: `a stone on a wall, number ${n}` }),
    id: `seed-${n}`,
    status: 'committed',
    createdAt: Date.UTC(2026, 9, n),
    updatedAt: Date.UTC(2026, 9, n),
    committedAt: Date.UTC(2026, 9, n),
    localDay: `2026-10-${String(n).padStart(2, '0')}`,
  });
  const leaves = () => screen.queryAllByTestId(/^book-leaf-\d$/, { includeHiddenElements: true });

  it.each([
    [0, 0],
    [1, 1],
    [5, 3],
  ])('riffles as many leaves as its %i echoes call for (%i)', async (count, expected) => {
    mockReduced = false;
    setJournal(
      createMemoryJournal({ entries: Array.from({ length: count }, (_, i) => echo(i + 1)) }),
    );
    await render(<JournalSession variant="daily" initialMode="write" />);
    // The stillness, and the book has begun: the count has long since arrived.
    await tick(FULL.stillness + 100);
    await waitFor(() => expect(leaves()).toHaveLength(expected));
  });

  it('does not riffle under Reduce Motion, however many echoes it holds', async () => {
    setJournal(createMemoryJournal({ entries: Array.from({ length: 9 }, (_, i) => echo(i + 1)) }));
    await render(<JournalSession variant="daily" initialMode="write" />);
    await tick(400);
    expect(leaves()).toHaveLength(0);
  });
});
