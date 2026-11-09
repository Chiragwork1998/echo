// A person who speaks does not touch the screen. At its timeout the phone sleeps, the app goes to the
// background, and the take stops itself, so they speak on to a recorder that is no longer listening.
// The screen therefore stays on from the moment a take starts until its words are on the page, or that
// attempt has failed and the note is up: recording, sealing, and sending, which a long take can spend
// twenty seconds on. Nothing else keeps it on: Home, an idle session, reading, and Write stay normal.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { copy } from '@/content/copy';
import {
  createMemoryJournal,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import { transcribeEntryAudio } from '@/services/transcription';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { usePreferences, VOICE_POLICY_VERSION } from '@/state/preferences';
import { render } from '@/testing/render';

import { JournalSession } from './JournalSession';
import { sessionCopy } from './sessionCopy';
import { JOURNAL_IDLE_MS, TAKE_KEEP_AWAKE_TAG } from './useKeepAwake';

// What is holding the screen on, by tag, as expo-keep-awake would count it.
const mockHeld = new Set<string>();
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async (tag: string) => void mockHeld.add(tag)),
  deactivateKeepAwake: jest.fn(async (tag: string) => void mockHeld.delete(tag)),
}));
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
jest.mock('@/features/journal', () => ({
  ...jest.requireActual('@/features/journal'),
  useVoiceRecorder: jest.fn(),
}));
jest.mock('@/features/journal/api', () => ({
  ...jest.requireActual('@/features/journal/api'),
  openEntryAudio: jest.fn(async () => ({ ok: false, error: { code: 'audio_failed' } })),
}));
jest.mock('@/services/permissions', () => ({
  requestMicrophonePermission: jest.fn(),
  openAppSettings: jest.fn(),
}));
jest.mock('@/services/transcription', () => ({
  ...jest.requireActual('@/services/transcription'),
  transcribeEntryAudio: jest.fn(),
}));

const send = jest.mocked(transcribeEntryAudio);
const RECORDED = { id: 'a1', extension: '.aac', durationSeconds: 5, recovered: false };
const said = (text: string) => ({
  ok: true as const,
  value: { text, polished: false, languages: ['en'], seconds: 2 },
});

type Voice = ReturnType<typeof useVoiceRecorder>;
let voice: Voice;
let journal: Journal;
let rerender: () => void = () => undefined;
let appState: (state: string) => void = () => undefined;

const held = () => mockHeld.has(TAKE_KEEP_AWAKE_TAG);
const scenery = () => screen.getByTestId('session-scenery');
const settle = () => act(async () => void (await Promise.resolve()));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockHeld.clear();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  usePreferences.setState({
    lastMode: 'speak',
    voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION },
    wordsShown: false,
    tidyWords: false,
  });
  journal = createMemoryJournal({ entries: [] });
  setJournal(journal);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    type: string,
    handler: (state: string) => void,
  ) => {
    if (type === 'change') appState = handler;
    return { remove: () => undefined };
  }) as never);
  send.mockResolvedValue(said('Spoken after the take.'));

  voice = {
    available: true,
    liveAvailable: false,
    state: 'idle',
    elapsedSeconds: 0,
    error: null,
    start: jest.fn(async () => {
      voice.state = 'recording';
      rerender();
      return null;
    }),
    stop: jest.fn(async () => {
      voice.state = 'idle';
      rerender();
      return { ok: true, value: RECORDED };
    }),
    cancel: jest.fn(),
  } as unknown as Voice;
  jest.mocked(useVoiceRecorder).mockImplementation(() => {
    const [, force] = useState(0);
    rerender = () => force((count) => count + 1);
    return { ...voice };
  });
});
afterEach(() => {
  setJournal(null);
  jest.useRealTimers();
});

async function open() {
  await render(<JournalSession variant="daily" plain />);
  await waitFor(() => expect(scenery().props.accessibilityState.disabled).toBe(false));
}
const startTake = async () => {
  await fireEvent.press(scenery());
  await waitFor(() => expect(voice.start).toHaveBeenCalled());
};
const stopTake = () =>
  fireEvent.press(screen.getByRole('button', { name: sessionCopy.quiet.stop }));

describe('the screen while a person journals', () => {
  it('is held while the page is open, and let go after a long quiet', async () => {
    await open();
    await settle();
    expect(held()).toBe(true);
    await act(async () => jest.advanceTimersByTime(JOURNAL_IDLE_MS + 100));
    expect(held()).toBe(false);
  });

  it('is held from the moment a take starts', async () => {
    await open();
    await startTake();
    expect(held()).toBe(true);
  });

  it('is still held while the recording is sent, and let go once the words are in', async () => {
    let arrive: (value: ReturnType<typeof said>) => void = () => undefined;
    send.mockReturnValue(new Promise((resolve) => (arrive = resolve)));
    await open();
    await startTake();
    await stopTake();
    await settle();
    // Stopped, sealed, and on its way: a long take can be twenty seconds here.
    expect(voice.state).toBe('idle');
    expect(held()).toBe(true);

    await act(async () => arrive(said('Something I have been avoiding.')));
    // The words are in, and the person reads them: the screen stays until a long quiet.
    await settle();
    expect(held()).toBe(true);
    await act(async () => jest.advanceTimersByTime(JOURNAL_IDLE_MS + 100));
    await waitFor(() => expect(held()).toBe(false));
  });

  it('is let go after a long quiet when the attempt fails and the note is up', async () => {
    send.mockResolvedValueOnce({ ok: false, error: { code: 'offline', retryable: true } });
    await open();
    await startTake();
    await stopTake();
    expect(await screen.findByText(sessionCopy.transcribe.failed.offline)).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(JOURNAL_IDLE_MS + 100));
    expect(held()).toBe(false);
  });

  it('is let go when the person leaves with Back while a take is running', async () => {
    await open();
    await startTake();
    expect(held()).toBe(true);
    await screen.unmount();
    expect(held()).toBe(false);
  });

  it('is let go when the app goes to the background, and held again on return', async () => {
    await open();
    await startTake();
    expect(held()).toBe(true);
    await act(async () => appState('background'));
    expect(held()).toBe(false);
    await act(async () => appState('active'));
    expect(held()).toBe(true);
  });

  it('is held while the person writes, counting the quiet from the last word', async () => {
    await render(<JournalSession variant="daily" plain initialMode="write" />);
    await waitFor(() => expect(scenery().props.accessibilityState.disabled).toBe(false));
    await settle();
    expect(held()).toBe(true);
    await act(async () => jest.advanceTimersByTime(JOURNAL_IDLE_MS - 1000));
    await fireEvent.changeText(screen.getByLabelText(copy.home.prompt), 'Velomir astrenay quolith');
    await act(async () => jest.advanceTimersByTime(JOURNAL_IDLE_MS - 1000));
    // Still within the quiet of the last word.
    expect(held()).toBe(true);
    await act(async () => jest.advanceTimersByTime(2000));
    expect(held()).toBe(false);
  });
});
