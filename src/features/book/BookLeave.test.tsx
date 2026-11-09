// Back while the daily book is opening, with nothing on its page: the page fades out by its own animation and
// the screen is popped (../journal-session). The walk (v11, S4) pressed Back just after the rise, with the book
// closed at rest: the book faded where it was, and 120 ms into the fade the unseating tick was felt, with
// nothing lifting. The opening stops where it is as the page goes, and nothing more of it is felt.
import { act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, BackHandler } from 'react-native';

import { cue } from '@/design/haptics';
import { tokens } from '@/design/tokens';
import { createMemoryJournal, setJournal, useVoiceRecorder } from '@/features/journal';
import { JournalSession } from '@/features/journal-session/JournalSession';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { resetPreferences, usePreferences } from '@/state/preferences';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { FULL } from './ritual';

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
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => false }));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));

const FRAME_MS = 16;
const handlers: (() => boolean)[] = [];

beforeEach(() => {
  // The book and the page's fade are walked a frame at a time, as their own animations.
  animationClock.reset();
  animationClock.stepped = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetPreferences();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  setJournal(createMemoryJournal({ entries: [] }));
  // A person who is not using a screen reader: the book is shown its full ritual.
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
const back = () => act(async () => void handlers.at(-1)?.());
const ticks = () => jest.mocked(cue).mock.calls.filter(([name]) => name === 'tick').length;

describe('Back while the book opens', () => {
  it('is not felt: the unseating tick dies with the opening, and the page goes', async () => {
    await render(<JournalSession variant="daily" initialMode="write" />);
    // The stillness, and the rise all but done: the cover is about to swing.
    await tick(FULL.stillness + FULL.rise - 40);
    expect(ticks()).toBe(0);
    await back();
    await tick(FULL.cover + tokens.motion.standard + 500);
    expect(ticks()).toBe(0);
    expect(router.dismissTo).toHaveBeenCalledWith('/home');
    // An opening that was stopped is not an opening.
    expect(usePreferences.getState().bookOpens).toBe(0);
  });

  it('is felt, once, by a book that is left to open', async () => {
    await render(<JournalSession variant="daily" initialMode="write" />);
    await tick(FULL.stillness + FULL.rise + FULL.cover + 300);
    expect(ticks()).toBe(1);
    expect(usePreferences.getState().bookOpens).toBe(1);
  });
});
