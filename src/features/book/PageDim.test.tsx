// A note about the voice is drawn over the middle of the page. With words on the page the two sat on
// top of each other and neither could be read. So while a note is drawn the words drop to a faint
// trace: plainly still there, and not fighting the note. They are never hidden (a person told their
// recording is safe, while their words vanish, would think the words were gone), they still read to a
// screen reader, and they come back at once when the note goes.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { copy } from '@/content/copy';
import { ThemeProvider } from '@/design/theme';
import {
  createMemoryJournal,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import { emptyContent } from '@/features/journal/content';
import { JournalSession } from '@/features/journal-session/JournalSession';
import { sessionCopy } from '@/features/journal-session/sessionCopy';
import { resetPreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { PAGE_DIMMED } from './Pages';

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
// The book arrives and opens at once, as it does under Reduce Motion.
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => true }));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));

const BODY = 'what the first take said';
let journal: Journal;
let error: 'unavailable' | null;

const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const words = () => screen.getByTestId('page-words', { includeHiddenElements: true });
// The real animation libraries draw from a shared value that moves on its own. The stand-in used in
// tests only reads it when the screen is drawn again, so this draws it once more.
const redraw = () =>
  screen.rerender(
    <ThemeProvider crossfade={false}>
      <JournalSession variant="daily" initialMode="speak" />
    </ThemeProvider>,
  );
const opacity = () => StyleSheet.flatten(words().props.style).opacity;
const note = () => screen.queryByText(sessionCopy.speak.unavailable);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetPreferences();
  error = 'unavailable';
  journal = createMemoryJournal({ entries: [] });
  setJournal(journal);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  jest.mocked(useVoiceRecorder).mockImplementation(
    () =>
      ({
        available: true,
        liveAvailable: false,
        state: 'idle',
        elapsedSeconds: 0,
        error,
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

async function open(wordsShown: boolean) {
  const { usePreferences } = jest.requireActual('@/state/preferences');
  usePreferences.setState({ wordsShown });
  await journal.saveDraft('d1', emptyContent({ body: BODY }));
  await render(<JournalSession variant="daily" initialMode="speak" />);
  await tick(600);
  await redraw();
}

describe('the words on the page while a note is drawn', () => {
  it('drop to a faint trace while the note is there, and are still on the page', async () => {
    await open(true);
    expect(note()).toBeTruthy();
    expect(opacity()).toBe(PAGE_DIMMED);
    expect(PAGE_DIMMED).toBeGreaterThan(0);
    expect(PAGE_DIMMED).toBeLessThan(0.3);
    expect(screen.getByLabelText(copy.home.prompt).props.value).toBe(BODY);
  });

  it('are not hidden from a screen reader', async () => {
    await open(true);
    expect(words().props.accessibilityElementsHidden).toBeFalsy();
    expect(words().props.importantForAccessibility).not.toBe('no-hide-descendants');
  });

  it('come back to full when the note clears, by any route', async () => {
    await open(true);
    expect(opacity()).toBe(PAGE_DIMMED);
    // Write instead: the way out of the note.
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.writeInstead }));
    await tick(600);
    await redraw();
    expect(note()).toBeNull();
    expect(opacity()).toBe(1);
  });

  it('stay at full when no note is drawn', async () => {
    error = null;
    await open(true);
    expect(note()).toBeNull();
    expect(opacity()).toBe(1);
  });

  it('stay hidden, not dimmed, when the person has chosen to hide them', async () => {
    await open(false);
    expect(opacity()).toBe(0);
  });
});

describe('the field the words are written in', () => {
  // Only a browser draws a focus ring to take away. Android cannot read an outline style at all, and
  // logged "Could not parse OutlineStyle:none" for every page drawn.
  it('carries no outline style on a phone', async () => {
    await open(true);
    const field = StyleSheet.flatten(screen.getByLabelText(copy.home.prompt).props.style);
    expect(field).not.toHaveProperty('outlineStyle');
    expect(field).not.toHaveProperty('outlineWidth');
  });
});
