import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { AccessibilityInfo, BackHandler, Dimensions, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { copy } from '@/content/copy';
import { cue, cuedWithin } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { netAfterBegin } from '@/features/book/animationEnd';
import { HomeTabBar, HomeTabBarProvider } from '@/features/home/tabs/HomeTabBar';
import { completionText } from '@/features/onboarding/completion/text';
import { createMemoryJournal, setJournal, type Entry, type Journal } from '@/features/journal';
import { requestReflection } from '@/services/reflection';
import { completeOnboarding, initialOnboarding, useOnboarding } from '@/state/onboarding';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { CompletionScreen, DailyCompletionScreen } from './CompletionScreen';

jest.mock('@/design/haptics');
let mockPath = '/home/complete';
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  Stack: { Screen: jest.fn(() => null) },
  usePathname: () => mockPath,
  // Runs the effect once on mount, as a focused screen would.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));
// Home's own dissolve, which this screen only asks to give Home back (see src/features/home/dissolve).
// Home is whole beneath the card, as it is once the card has given it back, for the tab bar beside it.
const mockReturnHome = jest.fn();
jest.mock('@/features/home/dissolve', () => ({
  useHomeDissolve: () => ({
    returnHome: mockReturnHome,
    phase: 'idle',
    progress: { value: 0, get: () => 0, set: () => undefined },
  }),
}));
jest.mock('@/services/reflection', () => {
  const actual =
    jest.requireActual<typeof import('@/services/reflection')>('@/services/reflection');
  return { ...actual, requestReflection: jest.fn(actual.requestReflection) };
});
jest.mock('@/state/onboarding', () => {
  const actual = jest.requireActual<typeof import('@/state/onboarding')>('@/state/onboarding');
  return { ...actual, completeOnboarding: jest.fn(actual.completeOnboarding) };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const actualReflection =
  jest.requireActual<typeof import('@/services/reflection')>(
    '@/services/reflection',
  ).requestReflection;
const actualComplete =
  jest.requireActual<typeof import('@/state/onboarding')>('@/state/onboarding').completeOnboarding;

const ENTRY_ID = 'entry-1';
const entry = (patch: Partial<Entry> = {}): Entry => ({
  id: ENTRY_ID,
  status: 'committed',
  body: 'words that belong to no one else',
  mode: 'text',
  durationSeconds: 12 * 60,
  createdAt: 1,
  updatedAt: 1,
  committedAt: 1,
  localDay: '2026-11-05',
  ...patch,
});

function install(seed: { entry?: Partial<Entry>; reflection?: string } = {}): Journal {
  const journal = createMemoryJournal({
    entries: [entry(seed.entry)],
    reflections: seed.reflection
      ? { [ENTRY_ID]: { status: 'complete', text: seed.reflection } }
      : undefined,
  });
  setJournal(journal);
  return journal;
}

function setWindow(width: number, height: number, fontScale = 1) {
  const metrics = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: metrics, screen: metrics });
}

const never = () => new Promise<never>(() => undefined);
const cta = () => screen.getByRole('button', { name: copy.completion.cta });
type Node = ReturnType<typeof screen.toJSON>;

/** Every background colour drawn anywhere in the rendered tree. */
function backgrounds(): string[] {
  const found: string[] = [];
  const walk = (node: Node | string) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const background = StyleSheet.flatten(node.props.style)?.backgroundColor;
    if (typeof background === 'string') found.push(background);
    node.children?.forEach(walk);
  };
  walk(screen.toJSON());
  return found;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  animationClock.reset();
  mockPath = '/home/complete';
  jest.mocked(requestReflection).mockImplementation(actualReflection);
  jest.mocked(completeOnboarding).mockImplementation(actualComplete);
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  useOnboarding.setState({ ...initialOnboarding, completedAt: undefined });
  setWindow(393, 852);
  install();
});
afterEach(() => setJournal(null));

describe('Completion in onboarding', () => {
  it('shows the title, subtitle, card, and the way into the space', async () => {
    await render(<CompletionScreen />);
    expect(screen.getByRole('header', { name: copy.completion.title })).toBeTruthy();
    expect(screen.getByText(copy.completion.subtitle)).toBeTruthy();
    expect(screen.getByText(copy.completion.cardTitle)).toBeTruthy();
    expect(cta()).toBeEnabled();
    expect(screen.getByRole('progressbar', { name: 'Step 8 of 8' })).toBeTruthy();
  });

  it('shows the real time written, from the entry', async () => {
    await render(<CompletionScreen />);
    expect(await screen.findByText('Saved privately · 12 minutes')).toBeTruthy();
  });

  it('says “1 minute”, not “1 minutes”', async () => {
    install({ entry: { durationSeconds: 60 } });
    await render(<CompletionScreen />);
    expect(await screen.findByText('Saved privately · 1 minute')).toBeTruthy();
  });

  it('keeps the deck’s own line for the deck’s seven minutes', async () => {
    install({ entry: { durationSeconds: 7 * 60 } });
    await render(<CompletionScreen />);
    expect(await screen.findByText(copy.completion.saved)).toBeTruthy();
  });

  it('with no reflection provider, is the private saved card, finished and not a failure', async () => {
    await render(<CompletionScreen />);
    await screen.findByText('Saved privately · 12 minutes');
    expect(screen.queryByText(completionText.pending)).toBeNull();
    expect(screen.queryByText(completionText.error)).toBeNull();
    expect(screen.queryByText(completionText.retry)).toBeNull();
    // Nothing that the entry holds is shown back.
    expect(screen.queryByText('words that belong to no one else')).toBeNull();
  });

  it('cues one commit on arrival and no other', async () => {
    await render(<CompletionScreen />);
    await screen.findByText('Saved privately · 12 minutes');
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('commit');
  });

  it('stays quiet on arrival when the closing has just settled, so the two never buzz twice', async () => {
    jest.mocked(cuedWithin).mockReturnValueOnce(true);
    await render(<CompletionScreen />);
    await screen.findByText('Saved privately · 12 minutes');
    expect(cuedWithin).toHaveBeenCalledWith('settle', 3000);
    expect(cue).not.toHaveBeenCalled();
  });

  it('completes onboarding on Enter your space and leaves the navigating to the root layout', async () => {
    await render(<CompletionScreen />);
    await fireEvent.press(cta());
    await waitFor(() => expect(useOnboarding.getState().completedAt).toBeDefined());
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does not complete twice on a double tap', async () => {
    await render(<CompletionScreen />);
    await fireEvent.press(cta());
    await fireEvent.press(cta());
    // Once its interface has let go.
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, tokens.motion.standard));
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('stays, says the words are saved, and can try again when finishing fails', async () => {
    jest.mocked(completeOnboarding).mockResolvedValueOnce(false);
    await render(<CompletionScreen />);
    await fireEvent.press(cta());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(completionText.enterFailed)).toBeTruthy();
    expect(cta()).toBeEnabled();

    await fireEvent.press(cta());
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('Completion with a reflection', () => {
  it('shows the reflection text when one exists', async () => {
    install({ reflection: 'A line from a real reflection.' });
    await render(<CompletionScreen />);
    expect(await screen.findByText('A line from a real reflection.')).toBeTruthy();
    expect(screen.getByText('Saved privately · 12 minutes')).toBeTruthy();
  });

  it('names the wait, with the saved line still in place, once it has taken a moment', async () => {
    jest.mocked(requestReflection).mockImplementation(never);
    await render(<CompletionScreen />);
    await screen.findByText('Saved privately · 12 minutes');
    expect(screen.queryByText(completionText.pending)).toBeNull();
    expect(await screen.findByText(completionText.pending, {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.getByText('Saved privately · 12 minutes')).toBeTruthy();
    expect(cta()).toBeEnabled();
  });

  it('breathes while listening, and holds still under Reduce Motion', async () => {
    jest.mocked(requestReflection).mockImplementation(never);
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    await render(<CompletionScreen />);
    await screen.findByText(completionText.pending, {}, { timeout: 2000 });
    expect(repeat).toHaveBeenCalled();

    repeat.mockClear();
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await screen.unmount();
    await render(<CompletionScreen />);
    await screen.findByText(completionText.pending, {}, { timeout: 2000 });
    expect(repeat).not.toHaveBeenCalled();
  });

  it('shows the saved words, Try again and Continue when the reflection fails', async () => {
    jest.mocked(requestReflection).mockResolvedValue({ status: 'error' });
    await render(<CompletionScreen />);
    expect(await screen.findByText(completionText.error)).toBeTruthy();
    expect(screen.getByRole('button', { name: completionText.retry })).toBeTruthy();
    expect(screen.getByRole('button', { name: completionText.continue })).toBeTruthy();
    expect(screen.getByText('Saved privately · 12 minutes')).toBeTruthy();
  });

  it('asks again on Try again, and shows the reflection if it comes this time', async () => {
    jest
      .mocked(requestReflection)
      .mockResolvedValueOnce({ status: 'error' })
      .mockResolvedValueOnce({ status: 'complete', text: 'It came back.' });
    await render(<CompletionScreen />);
    await screen.findByText(completionText.error);
    await fireEvent.press(screen.getByRole('button', { name: completionText.retry }));
    expect(await screen.findByText('It came back.')).toBeTruthy();
    expect(requestReflection).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(completionText.error)).toBeNull();
  });

  it('carries on from the error card with Continue', async () => {
    jest.mocked(requestReflection).mockResolvedValue({ status: 'error' });
    await render(<CompletionScreen />);
    await screen.findByText(completionText.error);
    await fireEvent.press(screen.getByRole('button', { name: completionText.continue }));
    await waitFor(() => expect(useOnboarding.getState().completedAt).toBeDefined());
  });
});

describe('Completion back handling', () => {
  function captureBack() {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: jest.fn() };
    });
    return handlers;
  }

  it('does nothing on the system back button, since the entry is already committed', async () => {
    const handlers = captureBack();
    await render(<CompletionScreen />);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]!()).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(useOnboarding.getState().completedAt).toBeUndefined();
  });

  it('has no back arrow', async () => {
    await render(<CompletionScreen />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});

describe('Completion after a daily session', () => {
  it('is the same plate and card without onboarding’s progress', async () => {
    await render(<DailyCompletionScreen />);
    expect(screen.getByRole('header', { name: copy.completion.title })).toBeTruthy();
    expect(await screen.findByText('Saved privately · 12 minutes')).toBeTruthy();
    expect(screen.getByRole('header', { name: copy.landing.wordmark })).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('8/8')).toBeNull();
  });

  // The daily session is still in the stack under this screen. `replace('/home')` left it there, so Home
  // came back as the bare photograph: its dissolve is only undone when the session unmounts. Popping to
  // the Home that is already in the stack closes both, and Home returns. Seen on the emulator at the end
  // of every daily echo: Reflect, Completion, Enter your space, a photograph with nothing on it.
  it('returns to Home by popping to it, and does not touch onboarding', async () => {
    await render(<DailyCompletionScreen />);
    await fireEvent.press(cta());
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/home'));
    expect(router.replace).not.toHaveBeenCalled();
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it('takes the system back button to Home, as its button does', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: jest.fn() };
    });
    await render(<DailyCompletionScreen />);
    let handled = false;
    await act(async () => {
      handled = handlers[0]!();
    });
    expect(handled).toBe(true);
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/home'));
  });

  it('turns off the swipe-back gesture', async () => {
    await render(<DailyCompletionScreen />);
    expect(jest.mocked(Stack.Screen).mock.calls[0]?.[0]).toMatchObject({
      options: { gestureEnabled: false },
    });
  });

  it('cues its own commit on arrival', async () => {
    await render(<DailyCompletionScreen />);
    expect(cue).toHaveBeenCalledWith('commit');
  });
});

describe('Completion at large text sizes and other shapes', () => {
  const night = tokens.color.night;

  it('uses regular glass at normal size', async () => {
    await render(<CompletionScreen />);
    await screen.findByText('Saved privately · 12 minutes');
    expect(backgrounds()).toContain(night.surfaceGlass);
    expect(backgrounds()).not.toContain(night.surfaceGlassStrong);
  });

  it('uses strong glass, and keeps every control, at 125% text', async () => {
    setWindow(393, 852, 1.25);
    await render(<CompletionScreen />);
    await screen.findByText('Saved privately · 12 minutes');
    expect(backgrounds()).toContain(night.surfaceGlassStrong);
    expect(cta()).toBeEnabled();
    expect(screen.getByText(copy.completion.subtitle)).toBeTruthy();
  });

  it('shows the error actions at 200% text without losing the saved line', async () => {
    setWindow(393, 852, 2);
    jest.mocked(requestReflection).mockResolvedValue({ status: 'error' });
    await render(<CompletionScreen />);
    await screen.findByText(completionText.error);
    expect(screen.getByRole('button', { name: completionText.retry })).toBeTruthy();
    expect(screen.getByText('Saved privately · 12 minutes')).toBeTruthy();
    expect(cta()).toBeEnabled();
  });

  it.each([
    [360, 780],
    [430, 932],
    [852, 393],
  ])('renders on %i x %i', async (width, height) => {
    setWindow(width, height);
    await render(<CompletionScreen />);
    expect(await screen.findByText('Saved privately · 12 minutes')).toBeTruthy();
    expect(cta()).toBeEnabled();
  });

  it('keeps the touch targets of Try again and Continue at 44 pt', async () => {
    jest.mocked(requestReflection).mockResolvedValue({ status: 'error' });
    await render(<CompletionScreen />);
    await screen.findByText(completionText.error);
    for (const name of [completionText.retry, completionText.continue]) {
      const style = Object.assign(
        {},
        ...[screen.getByRole('button', { name }).props.style].flat(Infinity),
      );
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('Completion when the entry cannot be read', () => {
  it('still says the words are saved, and reads again on Try again', async () => {
    const real = createMemoryJournal({ entries: [entry()] });
    let failing = true;
    setJournal({
      ...real,
      latestEntry: async () =>
        failing
          ? { ok: false, error: { code: 'read_failed', retryable: true } }
          : real.latestEntry(),
    });
    await render(<CompletionScreen />);
    expect(await screen.findByText(completionText.error)).toBeTruthy();

    failing = false;
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: completionText.retry }));
    });
    expect(await screen.findByText('Saved privately · 12 minutes')).toBeTruthy();
  });
});

// The walk (E5): Enter your space cut to the bare photograph, and Home's interface came in 0.6 s
// later, because it was only given back once the session had been unmounted, on the JS thread, after
// the pop. It is given back behind the card instead, while the card is on show, so that when the
// card goes the photograph and Home arrive as one.
describe('Home’s interface comes back with its photograph', () => {
  // Fake timers are left on for the rest of the file, as the other tests here do: restoring them
  // leaves jest-expo's environment without a setTimeout.
  beforeAll(() => {
    jest.useFakeTimers();
  });

  it('is given back behind the card once the card has settled', async () => {
    await render(<DailyCompletionScreen />);
    await act(async () => void (await jest.advanceTimersByTimeAsync(tokens.motion.screen - 1)));
    expect(mockReturnHome).not.toHaveBeenCalled();
    await act(async () => void (await jest.advanceTimersByTimeAsync(1)));
    expect(mockReturnHome).toHaveBeenCalledTimes(1);
  });

  it('is given back at once when the person leaves sooner than that, before the pop', async () => {
    await render(<DailyCompletionScreen />);
    await fireEvent.press(cta());
    expect(mockReturnHome).toHaveBeenCalledTimes(1);
    await act(async () => void (await jest.advanceTimersByTimeAsync(tokens.motion.standard + 50)));
    expect(jest.mocked(router.dismissTo).mock.invocationCallOrder[0]).toBeGreaterThan(
      mockReturnHome.mock.invocationCallOrder[0]!,
    );
  });

  it('is not given back by a card that was left before it settled', async () => {
    const view = await render(<DailyCompletionScreen />);
    await view.unmount();
    await act(async () => void (await jest.advanceTimersByTimeAsync(tokens.motion.screen * 2)));
    expect(mockReturnHome).not.toHaveBeenCalled();
  });

  it('is not asked for by onboarding’s Completion, which has no Home beneath it', async () => {
    await render(<CompletionScreen />);
    await act(async () => void (await jest.advanceTimersByTimeAsync(tokens.motion.screen * 2)));
    expect(mockReturnHome).not.toHaveBeenCalled();
  });
});

// The walk (v11): Enter your space popped Completion with a route that changed before the card had
// left the screen. The stack's fade was not seen (the card went in a frame or two), and the tab bar,
// drawn above the stack, came with the route: over the card in two samples of six, and 0.7 s late after
// a Back. The card now leaves by its own fade, over a Home already whole beneath it, the bar comes as the
// fade ends, and the screen is popped once the fade has ended.
describe('Completion leaving for Home', () => {
  const FADE_MS = tokens.motion.standard;
  const FRAME_MS = 16;
  const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
  const ui = () => (
    <HomeTabBarProvider>
      <DailyCompletionScreen />
      <HomeTabBar />
    </HomeTabBarProvider>
  );
  type Shown = { card: number; bar: number };
  /** Draws the screen again, and says how much of the card and of the tab bar is drawn. */
  const drawn = async (): Promise<Shown> => {
    await screen.rerender(<ThemeProvider crossfade={false}>{ui()}</ThemeProvider>);
    const opacity = (id: string) =>
      StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style)
        .opacity as number;
    return { card: opacity('completion-exit'), bar: opacity('home-dock') };
  };
  const tabs = () => screen.queryAllByRole('tab');
  const back = () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: jest.fn() };
    });
    return handlers;
  };

  beforeEach(() => {
    // The fades are walked, a frame at a time, so that how much of each is drawn can be seen.
    animationClock.stepped = true;
  });

  it.each(['Enter your space', 'the system back button'])(
    'on %s, fades the card away, and pops the screen only once it has gone',
    async (way) => {
      const handlers = back();
      await render(ui());
      await advance(1000);
      if (way === 'Enter your space') await fireEvent.press(cta());
      else await act(async () => void handlers.at(-1)?.());
      expect(mockReturnHome).toHaveBeenCalled();
      await advance(FRAME_MS * 3);
      expect(router.dismissTo).not.toHaveBeenCalled();
      await advance(FADE_MS / 2 - FRAME_MS * 3);
      // Half way: the card is half there, going. It does not vanish in a frame.
      const half = (await drawn()).card;
      expect(half).toBeGreaterThan(0.1);
      expect(half).toBeLessThan(0.9);
      expect(router.dismissTo).not.toHaveBeenCalled();
      await advance(FADE_MS / 2 + FRAME_MS * 3);
      expect((await drawn()).card).toBe(0);
      expect(router.dismissTo).toHaveBeenCalledTimes(1);
      expect(router.dismissTo).toHaveBeenCalledWith('/home');
    },
  );

  it('takes no touch while it goes, and a second press or Back does nothing more', async () => {
    const handlers = back();
    await render(ui());
    await advance(1000);
    await fireEvent.press(cta());
    expect(screen.getByTestId('completion-exit').props.pointerEvents).toBe('none');
    await act(async () => void handlers.at(-1)?.());
    await advance(FADE_MS + 200);
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
  });

  it('brings the tab bar in as the card’s fade ends, and never draws it over the card', async () => {
    await render(ui());
    await advance(1000);
    expect((await drawn()).bar).toBe(0);
    expect(tabs()).toHaveLength(0);
    await fireEvent.press(cta());
    for (let at = 0; at < FADE_MS; at += FRAME_MS * 2) {
      const now = await drawn();
      if (now.card > 0) expect(now.bar).toBe(0);
      await advance(FRAME_MS * 2);
    }
    await advance(FRAME_MS * 2);
    expect((await drawn()).card).toBe(0);
    await advance(tokens.motion.fast / 2);
    // Coming, over Home, while the route still says Completion: it is drawn, but not yet touched or heard.
    const coming = (await drawn()).bar;
    expect(coming).toBeGreaterThan(0);
    expect(coming).toBeLessThan(1);
    expect(tabs()).toHaveLength(0);
    // The pop: Home is the route, and the bar, already there, is Home's again.
    mockPath = '/home';
    await advance(tokens.motion.fast);
    expect((await drawn()).bar).toBe(1);
    expect(tabs()).toHaveLength(4);
  });

  it('pops only when the fade has really ended, however late the UI thread begins it', async () => {
    await render(ui());
    await advance(1000);
    animationClock.lag = 1200;
    await fireEvent.press(cta());
    await advance(1000);
    // Not begun yet: the card is whole, and the bar, late alike, waits for it.
    const late = await drawn();
    expect(late.card).toBe(1);
    expect(late.bar).toBe(0);
    await advance(FADE_MS);
    expect(router.dismissTo).not.toHaveBeenCalled();
    await advance(400);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });

  it('is never held: a fade whose end is never heard is let go of a net after it began', async () => {
    await render(ui());
    await advance(1000);
    animationClock.silent = true;
    await fireEvent.press(cta());
    await advance(netAfterBegin(FADE_MS) - 100);
    expect(router.dismissTo).not.toHaveBeenCalled();
    await advance(300);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });

  it('pops nothing if it is left some other way while it fades', async () => {
    await render(ui());
    await advance(1000);
    await fireEvent.press(cta());
    await screen.unmount();
    await advance(FADE_MS + 500);
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});

// The welcome (the walk, v11): Enter your space cut from the whole of Completion to its photograph with
// nothing on it, and then to Home. Completion now lets its words, card and button go first, over its
// photograph, and completes onboarding (which moves the root layout to Home) only once they have gone:
// the frame between it and Home is the plate backing, which is that same photograph.
describe('Completion in onboarding, handing over to Home', () => {
  const FADE_MS = tokens.motion.standard;
  const FRAME_MS = 16;
  const advance = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
  type Json = { props: Record<string, unknown>; children?: (Json | string)[] | null };
  /** How much is drawn of the interface (each part of it), and of the photograph beneath it. */
  const drawn = async () => {
    await screen.rerender(
      <ThemeProvider crossfade={false}>
        <CompletionScreen />
      </ThemeProvider>,
    );
    const parts = screen
      .getAllByTestId('completion-going', { includeHiddenElements: true })
      .map((part) => StyleSheet.flatten(part.props.style).opacity as number);
    // The photograph: everything above the plate's own layer, multiplied.
    let photograph = 0;
    const walk = (node: unknown, above: number): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach((child) => walk(child, above));
      const { props, children } = node as Json;
      const own = (StyleSheet.flatten(props.style as never) as { opacity?: number } | undefined)
        ?.opacity;
      const here = above * (own ?? 1);
      if (props.testID === 'drift') photograph = here;
      walk(children, here);
    };
    walk(screen.toJSON(), 1);
    return { parts, photograph };
  };

  beforeEach(() => {
    // The fade is walked, a frame at a time, so that how much of it is drawn can be seen.
    animationClock.stepped = true;
  });

  it('lets the words, the card and the button go over the photograph, and only then completes onboarding', async () => {
    await render(<CompletionScreen />);
    await advance(1000);
    const before = await drawn();
    expect(before.parts).toHaveLength(3);
    expect(before.parts.every((opacity) => opacity === 1)).toBe(true);
    await fireEvent.press(cta());
    await advance(FADE_MS / 2);
    const half = await drawn();
    for (const opacity of half.parts) {
      expect(opacity).toBeGreaterThan(0.1);
      expect(opacity).toBeLessThan(0.9);
    }
    expect(half.photograph).toBe(1);
    expect(completeOnboarding).not.toHaveBeenCalled();
    await advance(FADE_MS / 2 + FRAME_MS * 3);
    const after = await drawn();
    expect(after.parts.every((opacity) => opacity === 0)).toBe(true);
    // The photograph stays, whole: it is what is seen until Home's comes up over it.
    expect(after.photograph).toBe(1);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('completes nothing if it is left while its interface goes', async () => {
    await render(<CompletionScreen />);
    await advance(1000);
    await fireEvent.press(cta());
    await advance(FADE_MS / 2);
    await screen.unmount();
    await advance(FADE_MS * 3);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it('waits for the fade to have really ended, however late the UI thread begins it', async () => {
    await render(<CompletionScreen />);
    await advance(1000);
    animationClock.lag = 1200;
    await fireEvent.press(cta());
    await advance(FADE_MS + 1000);
    expect(completeOnboarding).not.toHaveBeenCalled();
    await advance(400);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('lets go in 180 ms under Reduce Motion', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    await render(<CompletionScreen />);
    await advance(1000);
    await fireEvent.press(cta());
    await advance(tokens.motion.fast - FRAME_MS * 2);
    expect(completeOnboarding).not.toHaveBeenCalled();
    await advance(FRAME_MS * 4);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('brings its interface back, with the button free, when finishing fails', async () => {
    jest.mocked(completeOnboarding).mockResolvedValueOnce(false);
    await render(<CompletionScreen />);
    await advance(1000);
    await fireEvent.press(cta());
    await advance(FADE_MS + FRAME_MS * 3);
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    await advance(FADE_MS + FRAME_MS * 3);
    const back = await drawn();
    expect(back.parts.every((opacity) => opacity === 1)).toBe(true);
    expect(screen.getByText(completionText.enterFailed)).toBeTruthy();
    expect(cta()).toBeEnabled();
  });

  it('leaves the daily screen as it was: no part of it goes on its own', async () => {
    await render(<DailyCompletionScreen />);
    await advance(1000);
    expect(
      screen.queryAllByTestId('completion-going', { includeHiddenElements: true }),
    ).toHaveLength(0);
  });
});
