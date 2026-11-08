// The book shutting, as a session meets it: the entry is kept first, the cover comes down, and the next
// screen is asked for as it lands, to arrive over the book as it sinks (asked for after the sink, the sky
// was bare for as long as the screen takes to mount). How it looks is judged frame by frame; here is what
// it does and when.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AccessibilityInfo, BackHandler, Keyboard, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import {
  createMemoryJournal,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import { ImmersiveSession } from '@/features/journal-session/ImmersiveSession';
import { JournalSession } from '@/features/journal-session/JournalSession';
import {
  useSessionController,
  type SessionController,
} from '@/features/journal-session/useSessionController';
import { clearDialogs } from '@/features/tab-pages/Dialog';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { resetPreferences, usePreferences } from '@/state/preferences';
import { openDialog, renderWithDialogs } from '@/testing/dialogs';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { CLOSE_REDUCED_MS, FULL, HURRY_MS, SHORT, UI_HANG_MS, closeTimeline } from './ritual';

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
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));

const BODY = 'something I have carried';
let journal: Journal;

beforeEach(() => {
  mockReduced = false;
  // The cover and the book are walked, a frame at a time, as their own animations: the closing follows
  // them (./useBookClosing), so these are what it is waiting for. Seen straight, the cover lands at
  // 840 ms and the book sinks after its rest, as ./ritual plans.
  animationClock.reset();
  animationClock.stepped = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
  clearDialogs();
  resetPreferences();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  journal = createMemoryJournal({ entries: [] });
  setJournal(journal);
  // A person who is not using a screen reader: the book is shown its full ritual.
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
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
  jest.restoreAllMocks();
});

// Async, so that each step of the closing (a promise after a timer) runs before the next timer does,
// and a frame at a time, so that what a step asks of the screen (the book told to sink) is drawn
// before the next one: the closing follows the book's own animations, which the screen starts.
const FRAME_MS = 16;
const tick = async (ms: number) => {
  for (let left = ms; left > 0; left -= FRAME_MS) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(Math.min(FRAME_MS, left));
    });
  }
};
const field = () => screen.getByLabelText(copy.home.prompt, { includeHiddenElements: true });
const navigated = () => jest.mocked(router.navigate).mock.calls.map(([path]) => path);

/** A written entry in the daily book, up to the moment before Reflect is pressed. */
async function writeEntry(options: { dialogs?: boolean } = {}) {
  const ui = <JournalSession variant="daily" initialMode="write" />;
  await (options.dialogs ? renderWithDialogs(ui) : render(ui));
  // A tap says enough to the opening, so that the page is open at once.
  await fireEvent.press(screen.getByTestId('session-scenery'));
  await tick(HURRY_MS + 50);
  await waitFor(() => expect(field().props.editable).toBe(true));
  await fireEvent.changeText(field(), BODY);
  await fireEvent(field(), 'blur');
}
const reflect = async () => {
  await fireEvent.press(screen.getByTestId('quiet-reflect'));
  // The entry is kept first.
  await tick(0);
};

describe('the next screen', () => {
  it('waits for the cover to land, and is asked for then, with the book still to sink', async () => {
    await writeEntry();
    await reflect();
    const { contactAt, sinkAt } = closeTimeline(FULL);
    await tick(contactAt - 60);
    expect(router.navigate).not.toHaveBeenCalled();
    await tick(120);
    expect(navigated()).toEqual(['/home/complete']);
    // The book has not sunk yet: it rests a moment, and sinks as the screen arrives.
    expect(sinkAt).toBeGreaterThan(contactAt);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('book-stage', { includeHiddenElements: true }).props.style,
      ).opacity,
    ).toBe(1);
    await tick(3000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('is asked for sooner once the book has opened five times', async () => {
    usePreferences.setState({ bookOpens: 5 });
    await writeEntry();
    await reflect();
    const { contactAt } = closeTimeline(SHORT);
    await tick(contactAt - 60);
    expect(router.navigate).not.toHaveBeenCalled();
    await tick(120);
    expect(navigated()).toEqual(['/home/complete']);
  });

  it('keeps the ritual the session began with, whatever is counted while it runs', async () => {
    await writeEntry();
    usePreferences.setState({ bookOpens: 50 });
    await reflect();
    await tick(closeTimeline(SHORT).contactAt + 60);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('is asked for as the hurried book begins to sink when a tap says enough, with no buzz', async () => {
    await writeEntry();
    await reflect();
    await tick(200);
    expect(router.navigate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('session-scenery'));
    await tick(60);
    expect(navigated()).toEqual(['/home/complete']);
    await tick(HURRY_MS + 2000);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(cue).not.toHaveBeenCalled();
  });

  it('lets the keys go as the book begins to shut, so it settles back to its place', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await writeEntry();
    expect(dismiss).not.toHaveBeenCalled();
    await reflect();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('is felt once, where the cover lands', async () => {
    await writeEntry();
    await reflect();
    await tick(closeTimeline(FULL).contactAt + 50);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('settle');
  });

  describe('on a phone that is behind the clock', () => {
    // The UI thread begins every animation the closing plays 2 s after it was asked: the walk measured
    // 1.8 to 2.1 s. The clock says the book is shut; it is not, and nothing that says it is shut, or
    // that it has done with a leaf, may happen until it is: no net may go off in the middle of the motion.
    const LATE = 2000;

    it('does not feel the cover down, or ask for the next screen, before the cover has come down', async () => {
      await writeEntry();
      animationClock.lag = LATE;
      await reflect();
      // Where the old net, the ritual's length plus 1500 ms, called a cover in the air shut.
      await tick(closeTimeline(FULL).contactAt + 1500 + 300);
      expect(cue).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      await tick(LATE - 1500 - 300 - 100);
      expect(cue).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      await tick(200);
      expect(cue).toHaveBeenCalledTimes(1);
      expect(cue).toHaveBeenCalledWith('settle');
      expect(navigated()).toEqual(['/home/complete']);
    });

    it('asks for the next screen once, as the cover lands, however late that is', async () => {
      await writeEntry();
      animationClock.lag = LATE;
      await reflect();
      await tick(closeTimeline(FULL).contactAt + LATE + 100);
      expect(navigated()).toEqual(['/home/complete']);
      await tick(5000);
      expect(router.navigate).toHaveBeenCalledTimes(1);
    });

    it('keeps the last leaf until it has turned', async () => {
      await writeEntry();
      animationClock.lag = LATE;
      await reflect();
      await tick(FULL.close.leaf + 1500 + 300);
      expect(screen.queryByTestId('book-closing-leaf')).not.toBeNull();
      await tick(LATE - 1500 - 300 - 100);
      expect(screen.queryByTestId('book-closing-leaf')).not.toBeNull();
      await tick(200);
      expect(screen.queryByTestId('book-closing-leaf')).toBeNull();
    });

    it('is given up on, a very long time after, and the book goes on, if the animations never answer', async () => {
      await writeEntry();
      animationClock.lag = 1_000_000;
      await reflect();
      await tick(closeTimeline(FULL).endAt + 4 * 1500);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(screen.queryByTestId('book-closing-leaf')).not.toBeNull();
      await tick(closeTimeline(FULL).contactAt + UI_HANG_MS);
      expect(navigated()).toEqual(['/home/complete']);
      expect(cue).toHaveBeenCalledTimes(1);
    });
  });

  it('goes at 180 ms under Reduce Motion, with a single commit and no leaf', async () => {
    mockReduced = true;
    await writeEntry();
    await reflect();
    expect(screen.queryByTestId('book-closing-leaf')).toBeNull();
    await tick(CLOSE_REDUCED_MS - 40);
    expect(router.navigate).not.toHaveBeenCalled();
    await tick(80);
    expect(navigated()).toEqual(['/home/complete']);
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('commit');
  });

  it('does not close, and does not leave, when the entry could not be kept', async () => {
    jest.spyOn(journal, 'commitEntry').mockResolvedValue({
      ok: false,
      error: { code: 'write_failed', retryable: true },
    });
    await writeEntry();
    await reflect();
    await tick(5000);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('book-closing-leaf')).toBeNull();
    // The book stays open, and Reflect is ready to try again.
    expect(field().props.editable).toBe(true);
    expect(screen.getByTestId('quiet-reflect').props.accessibilityState?.disabled).toBeFalsy();
    expect(cue).not.toHaveBeenCalled();
  });
});

describe('First Echo', () => {
  it('shuts its book before Completion, in the same time', async () => {
    await render(<JournalSession variant="onboarding" initialMode="write" />);
    const volume = () => screen.getByRole('button', { name: /^Your Echo, volume \d of 8$/ });
    // The shelf is rolled to the volume, and a second touch on the centred one chooses it.
    await tick(1500);
    await fireEvent.press(volume());
    await tick(1500);
    await fireEvent.press(volume());
    // The shelf lets the volume go before the book comes forward.
    await tick(1200);
    // A tap says enough to the book coming forward and opening.
    await fireEvent.press(screen.getByTestId('session-scenery'));
    await tick(HURRY_MS + 50);
    const title = () =>
      screen.getByLabelText(copy.firstEcho.title, { includeHiddenElements: true });
    await waitFor(() => expect(title().props.editable).toBe(true));
    await fireEvent.changeText(title(), BODY);
    await fireEvent(title(), 'blur');
    await reflect();
    await tick(closeTimeline(FULL).contactAt - 60);
    expect(router.navigate).not.toHaveBeenCalled();
    await tick(120);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });
});

describe('the last leaf', () => {
  it('carries the page’s own words away', async () => {
    await writeEntry();
    await reflect();
    const leaf = screen.getByTestId('book-closing-leaf');
    expect(within(leaf).getByText(BODY)).toBeTruthy();
    // It goes when it has landed.
    await tick(FULL.close.leaf + 50);
    expect(screen.queryByTestId('book-closing-leaf')).toBeNull();
  });

  it('is blank when the words are hidden, though they are kept', async () => {
    function Hidden() {
      const session = useSessionController({ variant: 'daily', initialMode: 'write' });
      return <ImmersiveSession session={session} page="vellum" concealed />;
    }
    await render(<Hidden />);
    await fireEvent.press(screen.getByTestId('session-scenery'));
    await tick(HURRY_MS + 50);
    await waitFor(() => expect(field().props.editable).toBe(true));
    await fireEvent.changeText(field(), BODY);
    await fireEvent(field(), 'blur');
    await reflect();
    const leaf = screen.getByTestId('book-closing-leaf');
    expect(within(leaf).queryByText(BODY)).toBeNull();
    // Every word is still kept, though none is shown.
    const latest = await journal.latestEntry();
    if (!latest.ok || !latest.value) throw new Error('nothing was kept');
    expect(await journal.getEntry(latest.value.id)).toMatchObject({
      ok: true,
      value: { body: BODY },
    });
  });

  it('is not drawn at all under Reduce Motion', async () => {
    mockReduced = true;
    await writeEntry();
    await reflect();
    expect(screen.queryByTestId('book-closing-leaf')).toBeNull();
  });
});

describe('Back, while the book is shutting', () => {
  const handlers: (() => boolean)[] = [];
  beforeEach(() => {
    handlers.length = 0;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: jest.fn() };
    });
  });
  const back = () => act(() => void handlers.at(-1)?.());

  it('does nothing: the entry is kept, and there is nothing left to leave', async () => {
    await writeEntry({ dialogs: true });
    await reflect();
    await tick(200);
    await back();
    expect(openDialog()).toBeNull();
    await tick(2000);
    expect(navigated()).toEqual(['/home/complete']);
  });

  it('still asks about a draft that is not being kept', async () => {
    await writeEntry({ dialogs: true });
    await back();
    expect(openDialog()).not.toBeNull();
  });
});

describe('a closing that does not end', () => {
  function Probe({
    hold,
    publish,
  }: {
    hold: () => Promise<void>;
    publish: (s: SessionController) => void;
  }) {
    const session = useSessionController({ variant: 'daily', initialMode: 'write' });
    const { onLeave } = session;
    useEffect(() => onLeave(hold), [hold, onLeave]);
    useEffect(() => {
      publish(session);
    });
    return null;
  }
  const drive = async (hold: () => Promise<void>) => {
    let latest!: SessionController;
    await render(<Probe hold={hold} publish={(s) => (latest = s)} />);
    await waitFor(() => expect(latest.ready).toBe(true));
    await act(async () => latest.change(BODY));
    await waitFor(() => expect(latest.canReflect).toBe(true));
    await act(async () => void latest.reflect());
    await tick(0);
  };

  it('is given up on after a minute, so the session can never hang', async () => {
    await drive(() => new Promise<void>(() => undefined));
    await tick(59_000);
    expect(router.navigate).not.toHaveBeenCalled();
    await tick(2000);
    expect(navigated()).toEqual(['/home/complete']);
  });

  it('is given up on at once if it fails', async () => {
    await drive(() => Promise.reject(new Error('the book would not shut')));
    await tick(10);
    expect(navigated()).toEqual(['/home/complete']);
  });

  it('is not waited for by a page that has no book', async () => {
    await render(<JournalSession plain variant="daily" initialMode="write" />);
    await waitFor(() => expect(screen.getByLabelText(copy.home.prompt).props.editable).toBe(true));
    await fireEvent.changeText(screen.getByLabelText(copy.home.prompt), BODY);
    await fireEvent(screen.getByLabelText(copy.home.prompt), 'blur');
    await fireEvent.press(screen.getByTestId('quiet-reflect'));
    await tick(0);
    await waitFor(() => expect(navigated()).toEqual(['/home/complete']));
  });
});
