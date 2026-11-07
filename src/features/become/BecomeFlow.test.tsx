import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, AppState } from 'react-native';

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
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));
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
    await fireEvent.press(screen.getByTestId('rehearse-sky'));
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
