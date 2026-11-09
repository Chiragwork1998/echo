// Leaving the daily session without Reflect: Back, and then Keep draft or Discard, or Back on a page with
// nothing on it. The walk (v10) found the keyboard rising a second time after Keep draft, as the dialog's
// window went and the page's field, still focused, was given the keys back; and then the book and its
// controls vanishing in one frame as the screen was popped. So: the keys are let go at the choice, so that
// nothing is left to give them back to, and the page fades out by its own animation before the screen is
// popped, whatever the stack's own transition does.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, BackHandler, Keyboard, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { copy } from '@/content/copy';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { netAfterBegin } from '@/features/book/animationEnd';
import { HURRY_MS } from '@/features/book/ritual';
import {
  createMemoryJournal,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import { clearDialogs, DialogHost } from '@/features/tab-pages/Dialog';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { resetPreferences } from '@/state/preferences';
import { chooseInDialog, openDialog } from '@/testing/dialogs';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { JournalSession } from './JournalSession';
import { sessionCopy } from './sessionCopy';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => {
  const { useEffect: effect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
    usePathname: () => '/home/session',
    useFocusEffect: (run: () => void | (() => void)) => effect(run, [run]),
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('@/testing/reanimatedMock').reanimatedMock,
  useAnimatedKeyboard: () => ({ height: { get: () => 0 }, state: { get: () => 0 } }),
}));
let mockReduced = false;
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
const mockReturnHome = jest.fn();
jest.mock('@/features/home/dissolve', () => {
  const actual = jest.requireActual('@/features/home/dissolve');
  return {
    ...actual,
    useHomeDissolve: () => ({ ...actual.useHomeDissolve(), returnHome: mockReturnHome }),
  };
});
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));

const BODY = 'something I have carried';
const FADE_MS = tokens.motion.standard;
const FRAME_MS = 16;
let journal: Journal;
let saveFails: boolean;
const handlers: (() => boolean)[] = [];

beforeEach(() => {
  mockReduced = false;
  animationClock.reset();
  // The page's fade is walked, a frame at a time, so that how much of it is drawn can be seen.
  animationClock.stepped = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
  clearDialogs();
  resetPreferences();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  const inner = createMemoryJournal({ entries: [] });
  saveFails = false;
  journal = {
    ...inner,
    saveDraft: (id, content) =>
      saveFails
        ? Promise.resolve({ ok: false, error: { code: 'write_failed', retryable: true } })
        : inner.saveDraft(id, content),
  };
  setJournal(journal);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  handlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler as () => boolean);
    return { remove: jest.fn() };
  });
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
  animationClock.reset();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const tick = async (ms: number) => {
  for (let left = ms; left > 0; left -= FRAME_MS) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(Math.min(FRAME_MS, left));
    });
  }
};

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
/** A fresh element each time: a stand-in that reads a shared value only when the screen is drawn needs a draw. */
const ui = () => (
  <>
    <JournalSession variant="daily" initialMode="write" />
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <DialogHost />
    </SafeAreaInsetsContext.Provider>
  </>
);
const field = () => screen.getByLabelText(copy.home.prompt, { includeHiddenElements: true });
const back = () => fireEvent.press(screen.getByTestId('quiet-back'));
const root = () => screen.getByTestId('session-fade', { includeHiddenElements: true });
/** Draws the screen again, and says how much of the page is drawn. */
const shown = async () => {
  await screen.rerender(<ThemeProvider crossfade={false}>{ui()}</ThemeProvider>);
  return StyleSheet.flatten(root().props.style).opacity as number;
};

/** The daily book, open, with something written, the field let go of so that the controls are there. */
async function open({ write = true }: { write?: boolean } = {}) {
  await render(ui());
  // A tap says enough to the opening, so the page is open at once.
  await fireEvent.press(screen.getByTestId('session-scenery'));
  await tick(HURRY_MS + 50);
  await waitFor(() => expect(field().props.editable).toBe(true));
  if (write) await fireEvent.changeText(field(), BODY);
  await fireEvent(field(), 'blur');
}

describe.each([
  ['Keep draft', sessionCopy.leave.keep],
  ['Discard', sessionCopy.leave.discard],
])('%s, from the daily book', (_name, label) => {
  it('lets the keys go the moment it is chosen, while the dialog is still up, so that nothing gives them back', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await open();
    await back();
    expect(openDialog()).not.toBeNull();
    expect(dismiss).not.toHaveBeenCalled();
    await chooseInDialog(label);
    // The field is blurred as the choice is made. Left focused, the system gave it the keys back as the
    // dialog's window went (1.4 s later on the walked emulator, over a page that was already leaving).
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(jest.mocked(router.dismissTo)).not.toHaveBeenCalled();
    await tick(3000);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('fades the page out, and pops the screen when it has gone, and not before', async () => {
    await open();
    await back();
    await chooseInDialog(label);
    await tick(FRAME_MS * 3);
    expect(router.dismissTo).not.toHaveBeenCalled();
    // Half way: the page is half there. It does not vanish in a frame.
    await tick(FADE_MS / 2 - FRAME_MS * 3);
    const half = await shown();
    expect(half).toBeGreaterThan(0.1);
    expect(half).toBeLessThan(0.9);
    await tick(FADE_MS / 2 - FRAME_MS);
    expect(router.dismissTo).not.toHaveBeenCalled();
    await tick(FRAME_MS * 3);
    expect(await shown()).toBe(0);
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('takes no touch while it goes, and a second Back opens nothing', async () => {
    await open();
    await back();
    await chooseInDialog(label);
    await tick(FRAME_MS * 4);
    expect(root().props.pointerEvents).toBe('none');
    await act(async () => void handlers.at(-1)?.());
    expect(openDialog()).toBeNull();
    await tick(FADE_MS + 200);
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
  });

  it('under Reduce Motion fades in the time of a blink', async () => {
    mockReduced = true;
    await open();
    await back();
    await chooseInDialog(label);
    await tick(tokens.motion.fast - FRAME_MS * 2);
    expect(router.dismissTo).not.toHaveBeenCalled();
    await tick(FRAME_MS * 4);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });
});

describe('leaving a daily page whose UI thread is behind or gone', () => {
  it('pops only when the fade has really ended, however late the UI thread is', async () => {
    await open();
    animationClock.lag = 1200;
    await back();
    await chooseInDialog(sessionCopy.leave.keep);
    await tick(FADE_MS + 1000);
    expect(router.dismissTo).not.toHaveBeenCalled();
    await tick(400);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });

  it('is never held: a fade whose end is never heard is let go of a net after it began', async () => {
    await open();
    animationClock.silent = true;
    await back();
    await chooseInDialog(sessionCopy.leave.keep);
    await tick(netAfterBegin(FADE_MS) - 100);
    expect(router.dismissTo).not.toHaveBeenCalled();
    await tick(300);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });
});

describe('Home, beneath the page', () => {
  it('is asked back as the page begins to fade, and not once the screen has gone', async () => {
    await open({ write: false });
    expect(mockReturnHome).not.toHaveBeenCalled();
    await back();
    // Asked at once: its return runs on the UI thread from here, whatever is late after it.
    expect(mockReturnHome).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).not.toHaveBeenCalled();
    await tick(FADE_MS + 60);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
    expect(mockReturnHome).toHaveBeenCalledTimes(1);
  });

  it.each([sessionCopy.leave.keep, sessionCopy.leave.discard])(
    'is asked back when %s begins the fade, and not while the dialog asks',
    async (label) => {
      await open();
      await back();
      expect(openDialog()).not.toBeNull();
      expect(mockReturnHome).not.toHaveBeenCalled();
      await chooseInDialog(label);
      await tick(FRAME_MS * 2);
      expect(mockReturnHome).toHaveBeenCalledTimes(1);
    },
  );

  it('is not asked back by Stay, or by a draft that could not be kept', async () => {
    await open();
    await back();
    await chooseInDialog(sessionCopy.leave.stay);
    await tick(FADE_MS * 2);
    expect(mockReturnHome).not.toHaveBeenCalled();
    saveFails = true;
    await back();
    await chooseInDialog(sessionCopy.leave.keep);
    await tick(FADE_MS * 2);
    expect(mockReturnHome).not.toHaveBeenCalled();
  });
});

describe('Back on a page with nothing on it', () => {
  it('lets the keys go, fades the page, and pops the screen', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await open({ write: false });
    await back();
    expect(openDialog()).toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).not.toHaveBeenCalled();
    await tick(FADE_MS + 60);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
  });
});

describe('Stay', () => {
  it('changes nothing: the keys are not let go, and the page does not fade or go', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await open();
    await back();
    await chooseInDialog(sessionCopy.leave.stay);
    await tick(FADE_MS * 3);
    expect(dismiss).not.toHaveBeenCalled();
    expect(await shown()).toBe(1);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(root().props.pointerEvents).not.toBe('none');
  });
});

describe('a draft that could not be kept', () => {
  it('stays, whole: the keys are let go, but the page does not fade or go', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await open();
    saveFails = true;
    await back();
    await chooseInDialog(sessionCopy.leave.keep);
    await tick(FADE_MS * 3);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(await shown()).toBe(1);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(field().props.value).toBe(BODY);
  });
});

describe('First Echo', () => {
  it('lets the keys go as it is left, and goes at once, as it always has', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await render(
      <>
        <JournalSession variant="onboarding" plain initialMode="write" />
        <SafeAreaInsetsContext.Provider value={NO_INSETS}>
          <DialogHost />
        </SafeAreaInsetsContext.Provider>
      </>,
    );
    const input = () => screen.getByLabelText(copy.firstEcho.title);
    await waitFor(() => expect(input().props.editable).toBe(true));
    await fireEvent.changeText(input(), BODY);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await chooseInDialog(sessionCopy.leave.keep);
    expect(dismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/onboarding/arrival'));
  });
});
