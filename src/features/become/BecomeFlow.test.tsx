import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, AppState, BackHandler, StyleSheet, Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { ThemeProvider } from '@/design/theme';
import { useThemeHeld } from '@/design/themeHold';
import { tokens } from '@/design/tokens';
import { fingerAway, fingerDown } from '@/testing/pressed';
import { animationClock } from '@/testing/reanimatedMock';

import { JOURNAL_AUDIO_MODE } from '@/features/breathe/audio';
import { JournalSession } from '@/features/journal-session/JournalSession';
import { DailySessionScreen } from '@/features/journal-session/DailySessionScreen';
import {
  createMemoryJournal,
  getEntry,
  latestEntry,
  setJournal,
  useVoiceRecorder,
} from '@/features/journal';
import { DEFAULT_PRACTICE, usePreferences } from '@/state/preferences';
import { render } from '@/testing/render';

import { RECEDE_AFTER_MS } from '@/features/breathe/PracticeView';

import { becomeCopy } from './becomeCopy';
import { holdRehearsal, heldRehearsal, releaseRehearsal } from './rehearsal';
import { RehearseScreen } from './RehearseScreen';

const mockAudio = {
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => ({
    loop: false,
    volume: 1,
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
};
let mockParams: Record<string, string | undefined> = {};
let mockReduced = false;

jest.mock('@/services/nativeModules', () => ({ loadAudio: () => mockAudio }));
jest.mock('@/design/haptics');
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), push: jest.fn() },
    Stack: { Screen: () => null },
    usePathname: () => '/home/session',
    useLocalSearchParams: () => mockParams,
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
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: () => mockReduced }));
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/services/permissions', () => ({
  getMicrophonePermission: jest.fn(),
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));

const WORDS =
  'I will be calm with my team today. When the meeting gets tense, I will listen first.';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockReduced = false;
  releaseRehearsal();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: () => undefined }) as never);
  usePreferences.setState({
    lastMode: 'write',
    voiceConsent: null,
    practice: { ...DEFAULT_PRACTICE, begun: 1 },
  });
  setJournal(createMemoryJournal({ entries: [] }));
  jest.mocked(useVoiceRecorder).mockImplementation(
    () =>
      ({
        available: true,
        liveAvailable: false,
        state: 'idle',
        elapsedSeconds: 0,
        error: null,
        start: jest.fn(async () => null),
        stop: jest.fn(),
        cancel: jest.fn(),
      }) as never,
  );
});
afterEach(() => setJournal(null));

async function reflectWith(become: boolean) {
  await render(<JournalSession plain variant="daily" become={become} />);
  const label = become ? becomeCopy.question : 'What is asking for your attention?';
  const field = () => screen.getByLabelText(label);
  await waitFor(() => expect(field().props.editable).toBe(true));
  await fireEvent.changeText(field(), WORDS);
  await fireEvent(field(), 'blur');
  await fireEvent.press(screen.getByTestId('quiet-reflect'));
}

describe('a morning session', () => {
  it('asks who the person will be, saves the entry as become, and rehearses before Completion', async () => {
    await reflectWith(true);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/home/rehearse'));
    const latest = await latestEntry();
    if (!latest.ok || !latest.value) throw new Error('nothing was kept');
    expect(await getEntry(latest.value.id)).toMatchObject({
      ok: true,
      value: { promptId: 'become', promptText: becomeCopy.question, body: WORDS },
    });
    // The words go to Rehearse in memory, and nowhere in the route.
    expect(heldRehearsal()).toBe(WORDS);
    expect(JSON.stringify(jest.mocked(router.navigate).mock.calls)).not.toContain('calm');
  });

  it('keeps the evening as it was: the daily question, and straight to Completion', async () => {
    await reflectWith(false);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/home/complete'));
    const latest = await latestEntry();
    if (!latest.ok || !latest.value) throw new Error('nothing was kept');
    expect(await getEntry(latest.value.id)).toMatchObject({
      ok: true,
      value: { promptId: 'daily' },
    });
    expect(heldRehearsal()).toBeNull();
  });
});

describe('Arrive, before the morning session', () => {
  it('opens the morning session with Arrive, and a tap goes into the book', async () => {
    mockParams = { mode: 'write', prompt: 'become', arrive: '1' };
    await render(<DailySessionScreen />);
    expect(screen.getByRole('button', { name: becomeCopy.skip })).toBeTruthy();
    mockAudio.setAudioModeAsync.mockClear();
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    // The journal's audio mode is back before the session can record.
    await waitFor(() => expect(screen.getByLabelText(becomeCopy.question)).toBeTruthy());
    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith(JOURNAL_AUDIO_MODE);
    expect(usePreferences.getState().practice.arriveSkips).toBe(1);
  });

  it('draws no lift for a person who tapped before Arrive had gone dark', async () => {
    mockParams = { mode: 'write', prompt: 'become', arrive: '1' };
    await render(<DailySessionScreen />);
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    await waitFor(() => expect(screen.getByLabelText(becomeCopy.question)).toBeTruthy());
    expect(screen.queryByTestId('arrive-lift')).toBeNull();
  });

  it('leaves for Today on Back during Arrive, without opening the book or counting a skip', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean);
      return { remove: jest.fn() };
    });
    mockParams = { mode: 'voice', prompt: 'become', arrive: '1' };
    await render(<DailySessionScreen />);
    expect(screen.getByRole('button', { name: becomeCopy.skip })).toBeTruthy();
    mockAudio.setAudioModeAsync.mockClear();
    let handled = false;
    await act(async () => {
      handled = handlers.at(-1)?.() ?? false;
    });
    expect(handled).toBe(true);
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/home'));
    expect(screen.queryByLabelText(becomeCopy.question)).toBeNull();
    expect(usePreferences.getState().practice.arriveSkips).toBe(0);
    // The journal's audio mode is put back as the practice goes.
    await waitFor(() =>
      expect(mockAudio.setAudioModeAsync).toHaveBeenCalledWith(JOURNAL_AUDIO_MODE),
    );
  });

  it('is not offered after three mornings skipped in a row', async () => {
    usePreferences.setState({ practice: { ...DEFAULT_PRACTICE, arriveSkips: 3 } });
    mockParams = { mode: 'write', prompt: 'become', arrive: '1' };
    await render(<DailySessionScreen />);
    await waitFor(() => expect(screen.getByLabelText(becomeCopy.question)).toBeTruthy());
    expect(screen.queryByRole('button', { name: becomeCopy.skip })).toBeNull();
  });
});

describe('Rehearse', () => {
  beforeEach(() => jest.useFakeTimers());
  const advance = async (ms: number) => {
    for (let at = 0; at < ms; at += 1000) {
      await act(async () => void jest.advanceTimersByTime(1000));
    }
  };

  it('brings the words back a phrase at a time, then feels, then goes on to Completion', async () => {
    holdRehearsal(WORDS);
    await render(<RehearseScreen />);
    await advance(1500);
    expect(screen.getByText('I will be calm with\nmy team today.')).toBeTruthy();
    await advance(6000);
    expect(screen.getByText('When the meeting gets tense,')).toBeTruthy();
    await advance(14_000);
    expect(screen.getByText(becomeCopy.feel.replace('it, ', 'it,\n'))).toBeTruthy();
    await advance(36_000);
    expect(screen.getByText(becomeCopy.go)).toBeTruthy();
    await advance(5000);
    expect(router.replace).toHaveBeenCalledWith('/home/complete');
    expect(heldRehearsal()).toBeNull();
  });

  it('shows Skip on a tap, and Skip goes straight on', async () => {
    holdRehearsal(WORDS);
    await render(<RehearseScreen />);
    expect(screen.queryByRole('button', { name: becomeCopy.skip })).toBeNull();
    await fireEvent.press(screen.getByTestId('rehearse-sky', { includeHiddenElements: true }));
    await fireEvent.press(screen.getByRole('button', { name: becomeCopy.skip }));
    expect(router.replace).toHaveBeenCalledWith('/home/complete');
    expect(heldRehearsal()).toBeNull();
  });

  it('feels and goes on even when there were no words to bring back', async () => {
    await render(<RehearseScreen />);
    expect(screen.getByText(becomeCopy.feel.replace('it, ', 'it,\n'))).toBeTruthy();
  });

  it('tells a screen reader each phrase, politely', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    holdRehearsal(WORDS);
    await render(<RehearseScreen />);
    await advance(1500);
    expect(announce).toHaveBeenCalledWith('I will be calm with my team today.', { queue: true });
    // With a screen reader, Skip is always there.
    expect(screen.getByRole('button', { name: becomeCopy.skip })).toBeTruthy();
  });

  // TalkBack stopped on the whole sky, a stop with no name (the walk, v11). A touch there only brings Skip
  // up, and a screen reader always has Skip.
  it('keeps the sky out of TalkBack’s way, and Skip in it', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await render(<RehearseScreen />);
    await advance(1000);
    const sky = screen.getByTestId('rehearse-sky', { includeHiddenElements: true });
    // A Pressable on Android is focusable, and so clickable, unless it is told otherwise.
    expect(sky.props.focusable).toBe(false);
    expect(sky.props.importantForAccessibility).toBe('no');
    expect(screen.queryByTestId('rehearse-sky')).toBeNull();
    expect(screen.getByRole('button', { name: becomeCopy.skip })).toBeTruthy();
  });

  it('only fades its phrases under Reduce Motion: nothing moves', async () => {
    mockReduced = true;
    holdRehearsal(WORDS);
    await render(<RehearseScreen />);
    await advance(1500);
    expect(screen.getByText('I will be calm with\nmy team today.')).toBeTruthy();
    const moving = JSON.stringify(screen.getByTestId('rehearse-line').props.style);
    expect(moving).toContain('"translateY":0');
  });
});

// The stack's fade was not seen on the walked emulator (v11): Rehearse appeared within a frame or two, and its
// copy of the plate cut away the book that was still sinking beneath it. It arrives by its own fade.
describe('Rehearse arriving over the sinking book', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    animationClock.reset();
    animationClock.stepped = true;
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  });
  afterEach(() => {
    animationClock.reset();
    jest.restoreAllMocks();
  });
  const step = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
  const arrival = () =>
    StyleSheet.flatten(screen.getByTestId('rehearse-arrival').props.style).opacity as number;
  const shown = async () => {
    await screen.rerender(
      <ThemeProvider crossfade={false}>
        <RehearseScreen />
      </ThemeProvider>,
    );
    return arrival();
  };

  it('fades in from a hair above nothing, and is whole once its fade is done', async () => {
    holdRehearsal(WORDS);
    await render(<RehearseScreen />);
    // Drawn from its first frame, so that its photograph is on the GPU, and not yet seen.
    expect(arrival()).toBeGreaterThan(0);
    expect(arrival()).toBeLessThan(0.05);
    await step(tokens.motion.standard / 2);
    const half = await shown();
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    await step(tokens.motion.standard / 2 + 50);
    expect(await shown()).toBe(1);
    releaseRehearsal();
  });

  it('fades in the house’s short time under Reduce Motion', async () => {
    mockReduced = true;
    await render(<RehearseScreen />);
    await step(tokens.motion.fast + 50);
    expect(await shown()).toBe(1);
  });
});

// After the tests above, which leave their clock fake: this one needs it too.
describe('the dark Arrive leaves behind', () => {
  beforeEach(() => void jest.useFakeTimers());

  it('lifts the dark Arrive left over the plate, so the book does not meet a cut', async () => {
    mockParams = { mode: 'write', prompt: 'become', arrive: '1' };
    await render(<DailySessionScreen />);
    // Arrive has receded: the screen is almost black.
    await act(async () => void jest.advanceTimersByTime(RECEDE_AFTER_MS + 1));
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    await waitFor(() => expect(screen.getByLabelText(becomeCopy.question)).toBeTruthy());
    const lift = screen.getByTestId('arrive-lift');
    expect(StyleSheet.flatten(lift.props.style).opacity).toBe(0.9);
  });
});

const timings = (spy: jest.SpyInstance) =>
  spy.mock.calls.map(([to, options]) => ({
    to: to as number,
    duration: (options as { duration: number }).duration,
  }));

describe('Rehearse, line to line', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // An earlier test turned the screen reader on; these are about a person without one.
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());
  const feel = () => becomeCopy.feel.replace('it, ', 'it,\n');
  const step = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

  it('lets the feel line fade out before "Go and live it." comes in, as every other line does', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    await render(<RehearseScreen />);
    expect(screen.getByText(feel())).toBeTruthy();
    // The thirty-second breath ends: the line begins to leave.
    let left = false;
    for (let at = 0; at < 60_000 && !left; at += 100) {
      await step(100);
      left = timings(spy).some((timing) => timing.to === 0 && timing.duration === 500);
    }
    expect(left).toBe(true);
    await step(100);
    expect(screen.getByText(feel())).toBeTruthy();
    expect(screen.queryByText(becomeCopy.go)).toBeNull();
    // 500 ms out, 250 ms of nothing, then the next line.
    await step(700);
    expect(screen.queryByText(feel())).toBeNull();
    expect(screen.getByText(becomeCopy.go)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    await step(3900);
    expect(router.replace).toHaveBeenCalledWith('/home/complete');
  });

  it('brings Skip up over 450 ms on a touch and takes it away over 350, out of reach the whole time it is hidden', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    holdRehearsal(WORDS);
    await render(<RehearseScreen />);
    // Hidden: nothing to reach or to announce, whatever its opacity is doing.
    let hidden = false;
    for (
      let node = screen.getByTestId('rehearse-skip', { includeHiddenElements: true }).parent;
      node;
      node = node.parent
    ) {
      if (node.props.importantForAccessibility === 'no-hide-descendants') hidden = true;
    }
    expect(hidden).toBe(true);
    await fireEvent.press(screen.getByTestId('rehearse-sky', { includeHiddenElements: true }));
    expect(timings(spy)).toContainEqual({ to: 1, duration: 450 });
    expect(screen.getByRole('button', { name: becomeCopy.skip })).toBeTruthy();
    await step(4100);
    expect(timings(spy)).toContainEqual({ to: 0, duration: 350 });
    expect(screen.queryByRole('button', { name: becomeCopy.skip })).toBeNull();
  });

  it('fades Skip over 180 ms under Reduce Motion', async () => {
    mockReduced = true;
    const spy = jest.spyOn(Reanimated, 'withTiming');
    holdRehearsal(WORDS);
    await render(<RehearseScreen />);
    await fireEvent.press(screen.getByTestId('rehearse-sky', { includeHiddenElements: true }));
    await step(4100);
    const skip = timings(spy).filter((timing) => timing.to === 1 || timing.to === 0);
    expect(skip.every((timing) => timing.duration <= 700)).toBe(true);
    expect(timings(spy).filter((timing) => timing.duration === 180).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('dims Skip while it is pressed, as every quiet word is', async () => {
    holdRehearsal(WORDS);
    await render(<RehearseScreen />);
    await fireEvent.press(screen.getByTestId('rehearse-sky', { includeHiddenElements: true }));
    const skip = () => screen.getByTestId('rehearse-skip');
    expect(StyleSheet.flatten(skip().props.style).opacity).toBe(1);
    await fingerDown(skip());
    expect(StyleSheet.flatten(skip().props.style).opacity).toBe(0.6);
    await fingerAway(skip(), () => step(200));
    expect(StyleSheet.flatten(skip().props.style).opacity).toBe(1);
  });
});

describe('the theme through the morning', () => {
  beforeEach(() => void jest.useFakeTimers());
  const seen: boolean[] = [];
  function Held() {
    const held = useThemeHeld();
    seen.push(held);
    return <Text testID="held">{String(held)}</Text>;
  }

  it('is held through Arrive and handed to the book with no gap between', async () => {
    seen.length = 0;
    mockParams = { mode: 'write', prompt: 'become', arrive: '1' };
    await render(
      <>
        <Held />
        <DailySessionScreen />
      </>,
    );
    expect(screen.getByTestId('held')).toHaveTextContent('true');
    await fireEvent.press(screen.getByTestId('practice-sky', { includeHiddenElements: true }));
    await waitFor(() => expect(screen.getByLabelText(becomeCopy.question)).toBeTruthy());
    expect(screen.getByTestId('held')).toHaveTextContent('true');
    // The first render is before the hold is taken. After it, the hold is never let go.
    expect(seen.slice(1).includes(false)).toBe(false);
  });

  it('is held through Rehearse, and let go when it goes', async () => {
    const view = await render(
      <>
        <Held />
        <RehearseScreen />
      </>,
    );
    expect(screen.getByTestId('held')).toHaveTextContent('true');
    await view.unmount();
    const after = await render(<Held />);
    expect(screen.getByTestId('held')).toHaveTextContent('false');
    await after.unmount();
  });
});

describe('Arrive’s Skip', () => {
  beforeEach(() => void jest.useFakeTimers());

  it('dims while it is pressed', async () => {
    mockParams = { mode: 'write', prompt: 'become', arrive: '1' };
    await render(<DailySessionScreen />);
    const skip = () => screen.getByTestId('practice-end', { includeHiddenElements: true });
    expect(StyleSheet.flatten(skip().props.style).opacity).toBe(1);
    await fingerDown(skip());
    expect(StyleSheet.flatten(skip().props.style).opacity).toBe(0.6);
    await fingerAway(skip(), () => act(async () => void jest.advanceTimersByTime(200)));
    expect(StyleSheet.flatten(skip().props.style).opacity).toBe(1);
  });

  it('comes up over 650 ms, all of it together, rather than appearing whole', async () => {
    const spy = jest.spyOn(Reanimated, 'withTiming');
    mockParams = { mode: 'write', prompt: 'become', arrive: '1' };
    await render(<DailySessionScreen />);
    expect(timings(spy)).toContainEqual({ to: 1, duration: 650 });
    spy.mockRestore();
  });
});
