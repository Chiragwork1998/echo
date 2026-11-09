// The daily session and the keyboard. The walk (v11): a session was left through "Keep your draft?",
// raised by the on-screen Back with the keys up. The keys vanished under the sheet unseen by the page,
// Reanimated went on holding them open, and the next session's book rose to their place, with no keys on
// the screen and no Back, Speak or Reflect. The page also followed the keys 130 ms behind while the row
// rode them, and TalkBack stopped on the scenery with nothing to say. Invented words only.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, DeviceEventEmitter, Keyboard, StyleSheet } from 'react-native';
import { KeyboardState } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { copy } from '@/content/copy';
import { ThemeProvider } from '@/design/theme';
import { bookCopy } from '@/features/book/bookCopy';
import { resetBookOwner } from '@/features/book/owner';
import type { OwnerRecord } from '@/features/book/ownerStore';
import { FULL, HURRY_MS, closeTimeline } from '@/features/book/ritual';
import { createMemoryJournal, setJournal, useVoiceRecorder } from '@/features/journal';
import { clearDialogs, DialogHost } from '@/features/tab-pages/Dialog';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { resetPreferences } from '@/state/preferences';
import { chooseInDialog, openDialog } from '@/testing/dialogs';
import { animationClock, keyboard, keyboardState } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { KEYS_AWAY_CAP_MS } from './afterTheKeys';
import { JournalSession } from './JournalSession';
import { sessionCopy } from './sessionCopy';
import { CONTROLS } from './sky';

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
// The book's owner, sealed in memory: the question on the closed book is asked while none is asked yet.
let mockRecord: OwnerRecord = { v: 1, name: null, asked: true, namedOpens: 0 };
jest.mock('@/features/book/ownerStore', () => ({
  loadOwner: jest.fn(async () => ({ ok: true, value: mockRecord })),
  saveOwner: jest.fn(async (record: OwnerRecord) => {
    mockRecord = record;
    return { ok: true, value: null };
  }),
}));

const BODY = 'quiet lanterns over the weir';
const FRAME_MS = 16;
const KEYS = 336;

beforeEach(() => {
  mockReduced = false;
  mockRecord = { v: 1, name: null, asked: true, namedOpens: 0 };
  resetBookOwner();
  animationClock.reset();
  jest.useFakeTimers();
  jest.clearAllMocks();
  clearDialogs();
  resetPreferences();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  setJournal(createMemoryJournal({ entries: [] }));
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
afterEach(async () => {
  // React Native's own record of the keys outlives a test: it is told they went.
  await say('keyboardDidHide');
  keyboard.set(0);
  keyboardState.set(KeyboardState.UNKNOWN);
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

/** What Reanimated reports, as its keyboard listener sets both at once. */
const report = (state: KeyboardState, height: number) =>
  act(() => {
    keyboardState.set(state);
    keyboard.set(height);
  });

/** React Native's keyboard events, from the screen's own insets. */
const say = (event: 'keyboardDidShow' | 'keyboardDidHide') =>
  act(() => {
    DeviceEventEmitter.emit(event, {
      endCoordinates: { height: event === 'keyboardDidShow' ? 312 : 0, screenY: 600 },
    });
  });

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const ui = (mode: 'write' | 'speak' = 'write') => (
  <>
    <JournalSession variant="daily" initialMode={mode} />
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <DialogHost />
    </SafeAreaInsetsContext.Provider>
  </>
);
const field = () => screen.getByLabelText(copy.home.prompt, { includeHiddenElements: true });
const scenery = () => screen.getByTestId('session-scenery', { includeHiddenElements: true });

/** The daily book, open, with something written, the field let go of so that the controls are there. */
async function open(mode: 'write' | 'speak' = 'write') {
  await render(ui(mode));
  // A tap says enough to the opening, so the page is open at once.
  await fireEvent.press(scenery());
  await tick(HURRY_MS + 50);
  await waitFor(() => expect(field().props.editable).toBe(mode === 'write'));
  if (mode === 'write') {
    await fireEvent.changeText(field(), BODY);
    await fireEvent(field(), 'blur');
  }
}

/** The book and the quiet row as the screen draws them now: how far each has risen. */
async function drawn() {
  await screen.rerender(<ThemeProvider crossfade={false}>{ui()}</ThemeProvider>);
  const style = (id: string) =>
    StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style);
  const transform = (style('session-book').transform ?? []) as Record<string, number>[];
  return {
    book: -(transform.find((step) => 'translateY' in step)?.translateY ?? 0),
    scale: transform.find((step) => 'scale' in step)?.scale ?? 1,
    row: style('session-row').bottom as number,
  };
}

describe('a keyboard the session has not seen', () => {
  it('lifts neither the book nor the row: one held open from the last session is not there', async () => {
    await open();
    const rest = await drawn();
    // Reanimated tells the new session at once of the keyboard it never saw go: open, at its height.
    await report(KeyboardState.OPEN, KEYS);
    await tick(500);
    expect(await drawn()).toEqual(rest);
  });

  it('gives way to a real keyboard, which lifts the book and the row together, in step with the keys', async () => {
    await open();
    // Anything eased is walked a frame at a time, so that a page behind the keys would be seen behind.
    animationClock.stepped = true;
    const rest = await drawn();
    await report(KeyboardState.OPEN, KEYS);
    // The next keyboard opens: Reanimated, holding the old one, calls it a closing. A late frame jumps.
    await report(KeyboardState.CLOSING, 40);
    expect((await drawn()).row).toBe(40 + CONTROLS.aboveKeyboard);
    await report(KeyboardState.CLOSING, 280);
    const late = await drawn();
    expect(late.row).toBe(280 + CONTROLS.aboveKeyboard);
    // The book is already where it rests over keys of that height: it did not ease behind them.
    await report(KeyboardState.OPEN, 280);
    await tick(500);
    expect(await drawn()).toEqual(late);
    await report(KeyboardState.OPEN, KEYS);
    const up = await drawn();
    expect(up.row).toBe(KEYS + CONTROLS.aboveKeyboard);
    expect(up.book).toBeGreaterThan(rest.book);
  });
});

describe('keys that go under a sheet while the session is open', () => {
  it('let the book and the row down once React Native has seen them go', async () => {
    await open();
    const rest = await drawn();
    await report(KeyboardState.OPENING, 120);
    await report(KeyboardState.OPEN, KEYS);
    await say('keyboardDidShow');
    expect((await drawn()).row).toBe(KEYS + CONTROLS.aboveKeyboard);
    // A sheet takes the focus: the keys vanish under it, and only React Native sees them go.
    await say('keyboardDidHide');
    await tick(1000);
    expect(await drawn()).toEqual(rest);
  });
});

describe('Back with the keys up', () => {
  let dismiss: jest.SpyInstance;
  beforeEach(() => {
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
  });

  async function keysUp() {
    await report(KeyboardState.OPENING, 120);
    await report(KeyboardState.OPEN, KEYS);
    await say('keyboardDidShow');
  }

  it('lets the keys go first, and asks "Keep your draft?" once they have gone', async () => {
    await open();
    const rest = await drawn();
    await keysUp();
    await fireEvent.press(screen.getByTestId('quiet-back'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    // The page's own window runs the keys' going, and the sheet is not hidden behind them.
    expect(openDialog()).toBeNull();
    await report(KeyboardState.CLOSING, 160);
    await report(KeyboardState.CLOSED, 0);
    await tick(100);
    expect(openDialog()).toBeNull();
    await say('keyboardDidHide');
    expect(openDialog()).not.toBeNull();
    // Stay: nothing is left lifted for keys that have gone.
    await chooseInDialog(sessionCopy.leave.stay);
    await tick(500);
    expect(await drawn()).toEqual(rest);
  });

  it('asks anyway if the keys never say they have gone', async () => {
    await open();
    await keysUp();
    await fireEvent.press(screen.getByTestId('quiet-back'));
    await tick(KEYS_AWAY_CAP_MS - 50);
    expect(openDialog()).toBeNull();
    await tick(100);
    expect(openDialog()).not.toBeNull();
  });

  it('asks once: Back again while the keys go does nothing more', async () => {
    await open();
    await keysUp();
    await fireEvent.press(screen.getByTestId('quiet-back'));
    await fireEvent.press(screen.getByTestId('quiet-back'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    await say('keyboardDidHide');
    expect(openDialog()).not.toBeNull();
    await chooseInDialog(sessionCopy.leave.stay);
    expect(openDialog()).toBeNull();
    // Asked and answered: Back asks again.
    await fireEvent.press(screen.getByTestId('quiet-back'));
    expect(openDialog()).not.toBeNull();
  });

  it('asks nothing of a session that has gone while the keys went', async () => {
    await open();
    await keysUp();
    await fireEvent.press(screen.getByTestId('quiet-back'));
    await screen.unmount();
    await say('keyboardDidHide');
    await tick(KEYS_AWAY_CAP_MS + 100);
    expect(openDialog()).toBeNull();
  });

  it('asks at once when the keys are down, as it always has', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('quiet-back'));
    expect(dismiss).not.toHaveBeenCalled();
    expect(openDialog()).not.toBeNull();
  });
});

// The walk (v11): the keys came up whole in one frame while the closed book asked whose it was. The
// question rode up on them at once, and the book stepped back over six frames, so the question's words
// were drawn over its cover. The book steps back in the frame the question rises.
describe('the question on the closed book, with the keys', () => {
  it('steps the book back in the same frame as the keys come up, however suddenly', async () => {
    mockRecord = { v: 1, name: null, asked: false, namedOpens: 0 };
    animationClock.stepped = true;
    await open();
    await fireEvent.press(screen.getByTestId('quiet-reflect'));
    await tick(closeTimeline(FULL).contactAt + 20);
    expect(screen.getByText(bookCopy.name.question)).toBeTruthy();
    await fireEvent(screen.getByTestId('name-prompt'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 170 } },
    });
    const asked = await drawn();
    // The keys arrive whole, in one frame.
    await report(KeyboardState.OPENING, KEYS);
    const first = await drawn();
    expect(first.row).toBe(KEYS + CONTROLS.aboveKeyboard);
    expect(first.scale).toBeLessThan(asked.scale);
    // That first frame is already where the book rests over the keys: nothing was left to catch up.
    await report(KeyboardState.OPEN, KEYS);
    await tick(600);
    expect(await drawn()).toEqual(first);
  });
});

describe('the scenery, to a screen reader', () => {
  it('is not there at all while writing: no stop with nothing to say', async () => {
    await open();
    expect(scenery().props.accessible).toBe(false);
    expect(scenery().props.importantForAccessibility).toBe('no');
  });

  it('is the way to start a take while speaking, by name', async () => {
    await open('speak');
    expect(scenery().props.accessible).toBe(true);
    expect(scenery().props.accessibilityRole).toBe('button');
    expect(scenery().props.accessibilityLabel).toBe(sessionCopy.speak.record);
  });

  it('is not there before the page has opened', async () => {
    await render(ui('speak'));
    expect(scenery().props.accessible).toBe(false);
    expect(scenery().props.importantForAccessibility).toBe('no');
  });
});
