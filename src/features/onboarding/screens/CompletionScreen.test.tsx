import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { AccessibilityInfo, BackHandler, Dimensions, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { copy } from '@/content/copy';
import { tokens } from '@/design/tokens';
import { completionText } from '@/features/onboarding/completion/text';
import { createMemoryJournal, setJournal, type Entry, type Journal } from '@/features/journal';
import { requestReflection } from '@/services/reflection';
import { completeOnboarding, initialOnboarding, useOnboarding } from '@/state/onboarding';
import { render } from '@/testing/render';

import { CompletionScreen, DailyCompletionScreen } from './CompletionScreen';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  Stack: { Screen: jest.fn(() => null) },
  // Runs the effect once on mount, as a focused screen would.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
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

  it('gives one medium haptic on arrival and no other', async () => {
    await render(<CompletionScreen />);
    await screen.findByText('Saved privately · 12 minutes');
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
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
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
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
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });

  it('turns off the swipe-back gesture', async () => {
    await render(<DailyCompletionScreen />);
    expect(jest.mocked(Stack.Screen).mock.calls[0]?.[0]).toMatchObject({
      options: { gestureEnabled: false },
    });
  });

  it('gives its own medium haptic on arrival', async () => {
    await render(<DailyCompletionScreen />);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
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
