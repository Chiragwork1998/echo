// A note about the voice, or a failure to open the draft, is words on a page. Said before the cover
// has opened it lands on the closed book or the bare scenery, over bright river and lit windows, with
// nothing behind it to read it against. So it waits for the page. And a book that cannot open must not
// swallow it: after a grace the note comes anyway, because a person with nothing to read is worse off.
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { createMemoryJournal, setJournal, useVoiceRecorder } from '@/features/journal';
import { ThemeProvider } from '@/design/theme';
import { resetPreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { JournalSession } from './JournalSession';
import { OPEN_GRACE_MS } from './ImmersiveSession';
import { sessionCopy } from './sessionCopy';

jest.mock('@/design/haptics');
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
    usePathname: () => '/home/session',
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
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
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => false }));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));
// A book that opens only when the test says so, and draws nothing of its own.
let mockOpen: (() => void) | undefined;
jest.mock('@/features/book/BookPage', () => ({
  ...jest.requireActual('@/features/book/BookPage'),
  BookPage: (props: { onOpened?: () => void }) => {
    mockOpen = props.onOpened;
    return null;
  },
}));

const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const unavailable = () => screen.queryByText(sessionCopy.speak.unavailable);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockOpen = undefined;
  resetPreferences();
  setJournal(createMemoryJournal({ entries: [] }));
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  jest.mocked(useVoiceRecorder).mockImplementation(
    () =>
      ({
        available: true,
        liveAvailable: false,
        state: 'idle',
        elapsedSeconds: 0,
        // The speak view is "unavailable": a note shown as soon as the session opens in Speak.
        error: 'unavailable',
        start: jest.fn(async () => null),
        stop: jest.fn(),
        cancel: jest.fn(),
      }) as unknown as ReturnType<typeof useVoiceRecorder>,
  );
});
afterEach(() => {
  setJournal(null);
  jest.useRealTimers();
});

describe('a note over the daily book', () => {
  it('is not said on the closed cover', async () => {
    await render(<JournalSession variant="daily" initialMode="speak" />);
    await tick(500);
    expect(mockOpen).toBeDefined();
    expect(unavailable()).toBeNull();
  });

  it('comes once the page is open', async () => {
    await render(<JournalSession variant="daily" initialMode="speak" />);
    await tick(500);
    expect(unavailable()).toBeNull();
    await act(async () => mockOpen?.());
    expect(unavailable()).toBeTruthy();
  });

  it('comes anyway if the book cannot open, so the person is never left with nothing to read', async () => {
    await render(<JournalSession variant="daily" initialMode="speak" />);
    await tick(OPEN_GRACE_MS - 100);
    expect(unavailable()).toBeNull();
    await tick(200);
    expect(unavailable()).toBeTruthy();
  });

  it('shows a draft that cannot be opened the same way', async () => {
    const journal = createMemoryJournal({ entries: [] });
    setJournal({
      ...journal,
      getEntry: async () => ({ ok: false, error: { code: 'unreadable', retryable: false } }),
    });
    await render(<JournalSession variant="daily" initialMode="speak" draftId="gone" />);
    await tick(500);
    expect(screen.queryByText(sessionCopy.errors.unreadable)).toBeNull();
    await act(async () => mockOpen?.());
    expect(screen.queryByText(sessionCopy.errors.unreadable)).toBeTruthy();
  });
});

describe('how a note arrives', () => {
  // The stand-in for Reanimated reads a shared value only when the screen is drawn again.
  const redraw = () =>
    screen.rerender(
      <ThemeProvider crossfade={false}>
        <JournalSession variant="daily" initialMode="speak" />
      </ThemeProvider>,
    );
  const noteOpacity = () =>
    StyleSheet.flatten(
      screen.getByTestId('session-note', { includeHiddenElements: true }).props.style,
    ).opacity;

  it('comes up from nothing, and is not there in one frame at full strength', async () => {
    await render(<JournalSession variant="daily" initialMode="speak" />);
    await tick(500);
    await act(async () => mockOpen?.());
    expect(unavailable()).toBeTruthy();
    // On its first drawing it is transparent: it is about to come up, not to appear whole.
    expect(noteOpacity()).toBe(0);
    await redraw();
    expect(noteOpacity()).toBe(1);
    expect(unavailable()).toBeTruthy();
  });
});
