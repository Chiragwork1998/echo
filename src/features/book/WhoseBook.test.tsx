// "Whose book is this?": asked once, on the closed book, after an entry is kept, and never in
// onboarding. What it does and when; how it looks is judged frame by frame. Invented names only.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, BackHandler } from 'react-native';

import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { createMemoryJournal, setJournal, useVoiceRecorder } from '@/features/journal';
import { JournalSession } from '@/features/journal-session/JournalSession';
import { NAME_UNDRAW_MS } from '@/features/journal-session/ImmersiveSession';
import { NAME_IDLE_MS } from '@/features/journal-session/NamePrompt';
import { clearDialogs } from '@/features/tab-pages/Dialog';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { resetPreferences } from '@/state/preferences';
import { animationClock } from '@/testing/reanimatedMock';
import { render } from '@/testing/render';

import { bookCopy } from './bookCopy';
import { STAMP_AFTER } from './CoverArt';
import { stampMs } from './InscribedName';
import { resetBookOwner, useBookOwner } from './owner';
import type { OwnerRecord } from './ownerStore';
import { FULL, HURRY_MS, closeTimeline } from './ritual';

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
// The sealed record, held in memory: what is in it is the point here, not how it is sealed.
let mockRecord: OwnerRecord | 'unreadable' = { v: 1, name: null, asked: false, namedOpens: 0 };
jest.mock('./ownerStore', () => ({
  loadOwner: jest.fn(async () =>
    mockRecord === 'unreadable' ? { ok: false } : { ok: true, value: mockRecord },
  ),
  saveOwner: jest.fn(async (record: OwnerRecord) => {
    mockRecord = record;
    return { ok: true, value: null };
  }),
}));

const BODY = 'the kettle and the rain';
const NAME = 'Wren Halloway';

beforeEach(() => {
  mockReduced = false;
  // The cover and the book are walked a frame at a time, as their own animations: the closing follows them.
  animationClock.reset();
  animationClock.stepped = true;
  mockRecord = { v: 1, name: null, asked: false, namedOpens: 0 };
  jest.useFakeTimers();
  jest.clearAllMocks();
  clearDialogs();
  resetPreferences();
  resetBookOwner();
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
afterEach(() => {
  animationClock.reset();
  setJournal(null);
  resetBookOwner();
  jest.restoreAllMocks();
});

// A frame at a time, so that what a step asks of the screen is drawn before the next one.
const FRAME_MS = 16;
const tick = async (ms: number) => {
  for (let left = ms; left > 0; left -= FRAME_MS) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(Math.min(FRAME_MS, left));
    });
  }
};
const navigated = () => jest.mocked(router.navigate).mock.calls.map(([path]) => path);
const prompt = () => screen.queryByText(bookCopy.name.question);

async function writeAndReflect(variant: 'daily' | 'onboarding' = 'daily', plain = false) {
  await render(<JournalSession variant={variant} initialMode="write" plain={plain} />);
  if (variant === 'onboarding' && !plain) {
    const volume = () => screen.getByRole('button', { name: /^Your Echo, volume \d of 8$/ });
    await tick(1500);
    await fireEvent.press(volume());
    await tick(1500);
    await fireEvent.press(volume());
    await tick(1200);
  }
  if (!plain) {
    await fireEvent.press(screen.getByTestId('session-scenery'));
    await tick(HURRY_MS + 50);
  }
  const label = variant === 'daily' ? copy.home.prompt : copy.firstEcho.title;
  const field = () => screen.getByLabelText(label, { includeHiddenElements: true });
  await waitFor(() => expect(field().props.editable).toBe(true));
  await fireEvent.changeText(field(), BODY);
  await fireEvent(field(), 'blur');
  await fireEvent.press(screen.getByTestId('quiet-reflect'));
  await tick(0);
}
const toContact = () => tick(closeTimeline(FULL).contactAt + 20);

describe('the question', () => {
  it('is asked on the closed book once the cover is down, and kept as asked at once', async () => {
    await writeAndReflect();
    expect(prompt()).toBeNull();
    await toContact();
    expect(prompt()).toBeTruthy();
    expect(screen.getByText(bookCopy.name.line)).toBeTruthy();
    expect(useBookOwner.getState().asked).toBe(true);
    expect(mockRecord).toMatchObject({ asked: true, name: null });
    // The book waits for the answer: the next screen is not asked for.
    await tick(10_000);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('is never asked in onboarding, or on a page without the book', async () => {
    await writeAndReflect('onboarding');
    await tick(5000);
    expect(prompt()).toBeNull();
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(mockRecord).toMatchObject({ asked: false });
  });

  it('is never asked by the plain session', async () => {
    await writeAndReflect('daily', true);
    await tick(5000);
    expect(prompt()).toBeNull();
    expect(navigated()).toEqual(['/home/complete']);
  });

  it('is not asked again once it has been', async () => {
    mockRecord = { v: 1, name: null, asked: true, namedOpens: 0 };
    await writeAndReflect();
    await tick(closeTimeline(FULL).goAt + 50);
    expect(prompt()).toBeNull();
    expect(navigated()).toEqual(['/home/complete']);
  });

  it('is never asked when the record cannot be read', async () => {
    mockRecord = 'unreadable';
    await writeAndReflect();
    await tick(closeTimeline(FULL).goAt + 50);
    expect(prompt()).toBeNull();
    expect(navigated()).toEqual(['/home/complete']);
  });

  it('is left for another time when a tap hurries the closing', async () => {
    await writeAndReflect();
    await tick(200);
    await fireEvent.press(screen.getByTestId('session-scenery'));
    await tick(HURRY_MS + 50);
    expect(prompt()).toBeNull();
    expect(navigated()).toEqual(['/home/complete']);
    expect(mockRecord).toMatchObject({ asked: false });
  });
});

describe('Write it', () => {
  it('stamps the name, is felt once as it lands, holds it a moment, and then the book goes', async () => {
    await writeAndReflect();
    await toContact();
    await fireEvent.changeText(screen.getByTestId('name-field'), `  ${NAME} `);
    await fireEvent.press(screen.getByTestId('name-write'));
    await tick(0);
    expect(mockRecord).toMatchObject({ name: NAME, asked: true });
    expect(useBookOwner.getState().name).toBe(NAME);
    const lands = STAMP_AFTER + stampMs(NAME);
    await tick(lands - 20);
    expect(cue).not.toHaveBeenCalledWith('fine');
    await tick(40);
    expect(cue).toHaveBeenCalledWith('fine');
    expect(router.navigate).not.toHaveBeenCalled();
    // Held 400 ms, then the sink, and the next screen half way through it.
    await tick(400 + FULL.close.gap + FULL.close.sink / 2 + 50);
    expect(navigated()).toEqual(['/home/complete']);
  });

  it('cannot be pressed with nothing written', async () => {
    await writeAndReflect();
    await toContact();
    await fireEvent.changeText(screen.getByTestId('name-field'), '   ');
    expect(screen.getByTestId('name-write').props.accessibilityState?.disabled).toBe(true);
  });
});

describe('Not now', () => {
  it('takes the line back and lets the book go, without a name, and is not asked again', async () => {
    await writeAndReflect();
    await toContact();
    await fireEvent.press(screen.getByTestId('name-not-now'));
    await tick(NAME_UNDRAW_MS + FULL.close.gap + FULL.close.sink / 2 + 50);
    expect(navigated()).toEqual(['/home/complete']);
    expect(mockRecord).toMatchObject({ name: null, asked: true });
    expect(cue).not.toHaveBeenCalledWith('fine');
  });

  it('lets the book go as the line is as good as gone, so its sink and the next screen come together', async () => {
    await writeAndReflect();
    await toContact();
    await fireEvent.press(screen.getByTestId('name-not-now'));
    // The line is taken back over 320 ms, decelerating: it is nearly all gone by half way, and the book
    // does not wait for its last hair. It rests a beat, sinks, and the next screen is asked for as it
    // is half gone: all of it in about half a second, where it was a good deal more than that.
    await tick(NAME_UNDRAW_MS + FULL.close.gap + FULL.close.sink / 2 - 60);
    expect(router.navigate).not.toHaveBeenCalled();
    await tick(120);
    expect(navigated()).toEqual(['/home/complete']);
    expect(NAME_UNDRAW_MS + FULL.close.gap + FULL.close.sink / 2).toBeLessThan(520);
  });

  it('is what Back means while the book asks', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: jest.fn() };
    });
    await writeAndReflect();
    await toContact();
    await act(() => void handlers.at(-1)?.());
    await tick(NAME_UNDRAW_MS + FULL.close.gap + FULL.close.sink / 2 + 50);
    expect(navigated()).toEqual(['/home/complete']);
    expect(mockRecord).toMatchObject({ name: null, asked: true });
  });

  it('is what 45 seconds without a keystroke means', async () => {
    await writeAndReflect();
    await toContact();
    await tick(NAME_IDLE_MS - 1000);
    expect(router.navigate).not.toHaveBeenCalled();
    await tick(1000 + NAME_UNDRAW_MS + FULL.close.gap + FULL.close.sink / 2 + 50);
    expect(navigated()).toEqual(['/home/complete']);
    expect(mockRecord).toMatchObject({ name: null, asked: true });
  });
});

describe('Reduce Motion', () => {
  it('asks on the closed cover, and a written name comes in at once, felt once', async () => {
    mockReduced = true;
    await writeAndReflect();
    await tick(200);
    expect(prompt()).toBeTruthy();
    expect(screen.getByTestId('book-still-cover')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('name-field'), NAME);
    await fireEvent.press(screen.getByTestId('name-write'));
    await tick(200);
    expect(cue).toHaveBeenCalledWith('fine');
    await tick(400 + 200 + 50);
    expect(navigated()).toEqual(['/home/complete']);
  });
});

describe('a named book', () => {
  it('arrives with the name on its cover and in the page head, and counts the opening', async () => {
    mockRecord = { v: 1, name: NAME, asked: true, namedOpens: 0 };
    await render(<JournalSession variant="daily" initialMode="write" />);
    await fireEvent.press(screen.getByTestId('session-scenery'));
    await tick(HURRY_MS + 50);
    expect(screen.getAllByText(NAME, { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('page-head-name', { includeHiddenElements: true })).toBeTruthy();
    await waitFor(() => expect(mockRecord).toMatchObject({ namedOpens: 1 }));
  });
});
