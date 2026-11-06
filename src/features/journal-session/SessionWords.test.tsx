import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { copy } from '@/content/copy';
import {
  createMemoryJournal,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import type { PcmTap } from '@/features/journal/streamDriver';
import { LIVE_RATE } from '@/services/liveAudio';
import {
  openLiveSocket,
  type LiveEvent,
  type LiveHandlers,
  type LiveSocket,
} from '@/services/liveTranscription';
import { refineWords, transcribeEntryAudio } from '@/services/transcription';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { usePreferences, VOICE_POLICY_VERSION } from '@/state/preferences';
import { render } from '@/testing/render';

import { JournalSession } from './JournalSession';
import { sessionCopy } from './sessionCopy';
import { QUIET_MS } from './sky';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { navigate: jest.fn() },
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
  refineWords: jest.fn(jest.requireActual('@/services/transcription').refineWords),
}));
jest.mock('@/services/liveTranscription', () => ({
  ...jest.requireActual('@/services/liveTranscription'),
  openLiveSocket: jest.fn(),
}));

const send = jest.mocked(transcribeEntryAudio);
const refine = jest.mocked(refineWords);
const openSocket = jest.mocked(openLiveSocket);

const RECORDED = { id: 'a1', extension: '.wav', durationSeconds: 5, recovered: false };
const said = (text: string) => ({
  ok: true as const,
  value: { text, polished: false, languages: ['en'], seconds: 2 },
});
const loud = (seconds: number) =>
  new Int16Array(Math.round(seconds * LIVE_RATE)).map((_, i) => Math.round(6000 * Math.sin(i / 5)));

type Voice = ReturnType<typeof useVoiceRecorder>;
let voice: Voice;
let journal: Journal;
let tap: PcmTap | undefined;
let handlers: LiveHandlers;
let socket: { appendAudio: jest.Mock; commit: jest.Mock; close: jest.Mock };
/** The real recorder re-renders the page when its state changes. This does the same for the stand-in. */
let rerender: () => void = () => undefined;

const allowedLive = () =>
  usePreferences.setState({
    voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION, live: true },
  });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
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

  tap = undefined;
  socket = { appendAudio: jest.fn(), commit: jest.fn(), close: jest.fn() };
  openSocket.mockImplementation(async (given) => {
    handlers = given;
    return socket as LiveSocket;
  });
  refine.mockImplementation(jest.requireActual('@/services/transcription').refineWords);
  send.mockResolvedValue(said('Spoken after the take.'));

  voice = {
    available: true,
    liveAvailable: true,
    state: 'idle',
    elapsedSeconds: 0,
    error: null,
    start: jest.fn(async (options?: { tap?: PcmTap }) => {
      tap = options?.tap;
      voice.state = 'recording';
      rerender();
      return null;
    }),
    stop: jest.fn(async () => {
      voice.state = 'idle';
      tap?.(null);
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
  usePreferences.setState({ wordsShown: false, voiceConsent: null, tidyWords: false });
});

const scenery = () => screen.getByTestId('session-scenery');
const field = () => screen.getByLabelText(copy.home.prompt);
const wordsControl = () => screen.getByTestId('quiet-words');
const tick = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const settle = () => act(async () => void (await Promise.resolve()));

async function open() {
  await render(<JournalSession variant="daily" plain />);
  await waitFor(() => expect(scenery().props.accessibilityState.disabled).toBe(false));
}
/** Begins a take, and speaks into it so the page has seen the recording start. */
async function startTake(seconds = 1) {
  await fireEvent.press(scenery());
  await waitFor(() => expect(voice.start).toHaveBeenCalled());
  if (tap) await act(async () => tap?.(loud(seconds)));
}
const stopTake = () =>
  fireEvent.press(screen.getByRole('button', { name: sessionCopy.quiet.stop }));
const say = (event: LiveEvent) => act(async () => handlers.onEvent(event));
const body = async () => {
  const found = await journal.latestDraft();
  return found.ok ? found.value?.body : undefined;
};

describe('words hidden, the default (D-008)', () => {
  it('shows only the light while a take is spoken, and never opens a connection', async () => {
    await open();
    await startTake();
    expect(voice.start).toHaveBeenCalledWith(undefined);
    expect(tap).toBeUndefined();
    await stopTake();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await settle();
    expect(openSocket).not.toHaveBeenCalled();
    expect(socket.appendAudio).not.toHaveBeenCalled();
  });

  it('saves the words through the draft, but does not put them on the screen, and says nothing while it works', async () => {
    let arrive: (value: ReturnType<typeof said>) => void = () => undefined;
    send.mockReturnValue(new Promise((resolve) => (arrive = resolve)));
    await open();
    await startTake();
    await stopTake();
    await tick(500);
    // Pending: no '…listening', no words. The light is all there is.
    expect(screen.queryByText(sessionCopy.transcribe.listening)).toBeNull();

    await act(async () => arrive(said('Something I have been avoiding.')));
    await waitFor(async () => expect(await body()).toBe('Something I have been avoiding.'));
    expect(field().props.value).toBe('');
    expect(screen.queryByText('Something I have been avoiding.')).toBeNull();
    expect(screen.queryByText(sessionCopy.transcribe.listening)).toBeNull();
  });

  it('still tells the person plainly, and offers Try again, when the words do not come', async () => {
    send.mockResolvedValueOnce({ ok: false, error: { code: 'offline', retryable: true } });
    await open();
    await startTake();
    await stopTake();
    expect(await screen.findByText(sessionCopy.transcribe.failed.offline)).toBeTruthy();
    expect(screen.getByRole('button', { name: sessionCopy.errors.retry })).toBeTruthy();
  });

  it('says an unexpected failure is not the connection', async () => {
    send.mockResolvedValueOnce({ ok: false, error: { code: 'unexpected', retryable: true } });
    await open();
    await startTake();
    await stopTake();
    expect(await screen.findByText(sessionCopy.transcribe.failed.unexpected)).toBeTruthy();
    expect(screen.queryByText(sessionCopy.transcribe.failed.offline)).toBeNull();
    expect(sessionCopy.transcribe.failed.unexpected).not.toMatch(/connection|offline/i);
  });

  it('begins another take from a tap on the sky after the words failed to come', async () => {
    send.mockResolvedValueOnce({ ok: false, error: { code: 'unexpected', retryable: true } });
    await open();
    await startTake();
    await stopTake();
    await screen.findByText(sessionCopy.transcribe.failed.unexpected);
    (voice.start as jest.Mock).mockClear();
    await fireEvent.press(scenery());
    expect(voice.start).toHaveBeenCalledTimes(1);
  });

  it('offers Show words in the quiet row, and writing always shows what is typed', async () => {
    await open();
    await tick(QUIET_MS);
    expect(wordsControl()).toBeTruthy();
    expect(screen.getByText(sessionCopy.words.show)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: copy.firstEcho.write }));
    await fireEvent.changeText(field(), 'typed words');
    expect(field().props.value).toBe('typed words');
    expect(screen.queryByTestId('quiet-words')).toBeNull();
  });
});

describe('Show words: the first time it is turned on', () => {
  it('says plainly that the voice streams to OpenAI, may be kept 30 days, and that hiding avoids it', async () => {
    await open();
    await tick(QUIET_MS);
    await fireEvent.press(wordsControl());
    expect(await screen.findByText(sessionCopy.liveConsent.title)).toBeTruthy();
    for (const fact of sessionCopy.liveConsent.facts) expect(screen.getByText(fact)).toBeTruthy();
    const all = sessionCopy.liveConsent.facts.join(' ');
    expect(all).toMatch(/streams to OpenAI as you speak/);
    expect(all).toMatch(/up to 30 days/);
    expect(all).toMatch(/Hiding words avoids all of this/);
    // Nothing is decided, sent, or shown yet.
    expect(usePreferences.getState().wordsShown).toBe(false);
    expect(openSocket).not.toHaveBeenCalled();
  });

  it('keeps words hidden when the person says so, and leaves their voice choice alone', async () => {
    usePreferences.setState({ voiceConsent: null });
    await open();
    await tick(QUIET_MS);
    await fireEvent.press(wordsControl());
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.liveConsent.keep }),
    );
    expect(usePreferences.getState().wordsShown).toBe(false);
    expect(usePreferences.getState().voiceConsent).toBeNull();
    expect(screen.queryByText(sessionCopy.liveConsent.title)).toBeNull();
  });

  it('shows words once agreed, remembers it, and then Hide words is one tap with no question', async () => {
    await open();
    await tick(QUIET_MS);
    await fireEvent.press(wordsControl());
    const buttons = await screen.findAllByRole('button', { name: sessionCopy.liveConsent.allow });
    await fireEvent.press(buttons.at(-1)!);
    expect(usePreferences.getState().wordsShown).toBe(true);
    expect(usePreferences.getState().voiceConsent).toEqual({
      choice: 'allowed',
      version: VOICE_POLICY_VERSION,
      live: true,
    });
    expect(await screen.findByText(sessionCopy.words.hide)).toBeTruthy();

    await fireEvent.press(wordsControl());
    expect(usePreferences.getState().wordsShown).toBe(false);
    expect(screen.queryByText(sessionCopy.liveConsent.title)).toBeNull();
    // Turning it on again does not ask a second time.
    await fireEvent.press(wordsControl());
    expect(usePreferences.getState().wordsShown).toBe(true);
    expect(screen.queryByText(sessionCopy.liveConsent.title)).toBeNull();
  });

  it('asks again, before any voice streams, after the policy changed', async () => {
    usePreferences.setState({
      wordsShown: true,
      voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION - 1, live: true },
    });
    await open();
    await fireEvent.press(scenery());
    expect(await screen.findByText(sessionCopy.liveConsent.title)).toBeTruthy();
    expect(voice.start).not.toHaveBeenCalled();
    expect(openSocket).not.toHaveBeenCalled();

    // Declining keeps words hidden, and the take goes ahead the quiet way.
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.liveConsent.keep }));
    await waitFor(() => expect(voice.start).toHaveBeenCalledWith(undefined));
    expect(usePreferences.getState().wordsShown).toBe(false);
    expect(openSocket).not.toHaveBeenCalled();
  });
});

describe('words shown, heard live', () => {
  beforeEach(() => {
    allowedLive();
    usePreferences.setState({ wordsShown: true });
  });

  it('streams the take, shows the words as they come, in order, and puts them in the draft on stop', async () => {
    await open();
    await startTake();
    expect(voice.start).toHaveBeenCalledWith({ tap: expect.any(Function) });
    await waitFor(() => expect(openSocket).toHaveBeenCalledTimes(1));
    await settle();
    expect(socket.appendAudio).toHaveBeenCalled();

    await say({ kind: 'delta', itemId: 'one', text: ' I miss' });
    await say({ kind: 'delta', itemId: 'one', text: ' him' });
    expect(field().props.value).toBe('I miss him');

    await say({ kind: 'committed', itemId: 'one' });
    await say({ kind: 'delta', itemId: 'two', text: ' Actually no' });
    await stopTake();
    await say({ kind: 'committed', itemId: 'two' });
    // The second turn finishes first. The words still come out in the order they were spoken.
    await say({ kind: 'completed', itemId: 'two', text: 'Actually no, I needed him.' });
    await say({ kind: 'completed', itemId: 'one', text: 'I miss him.' });

    await waitFor(async () => expect(await body()).toBe('I miss him. Actually no, I needed him.'));
    // Exact words: no recording request, no second step, and no duplicate of the live words.
    expect(send).not.toHaveBeenCalled();
    expect(field().props.value).toBe('I miss him. Actually no, I needed him.');
    expect(socket.close).toHaveBeenCalled();
  });

  it('writes Hindi in Roman script through the same second step as any take, and shows it only once it is', async () => {
    refine.mockResolvedValue({ ok: true, value: { text: 'aaj mera mann bhaari hai' } });
    await open();
    await startTake();
    await waitFor(() => expect(openSocket).toHaveBeenCalled());
    await settle();
    await say({ kind: 'committed', itemId: 'one' });
    await stopTake();
    await say({ kind: 'completed', itemId: 'one', text: 'आज मेरा मन भारी है' });

    await waitFor(() =>
      expect(refine).toHaveBeenCalledWith('आज मेरा मन भारी है', expect.anything()),
    );
    await waitFor(async () => expect(await body()).toBe('aaj mera mann bhaari hai'));
    expect(send).not.toHaveBeenCalled();
  });

  it('tells the person calmly when the connection drops, keeps recording, and sends the recording instead', async () => {
    await open();
    await startTake();
    await waitFor(() => expect(openSocket).toHaveBeenCalled());
    await settle();
    await say({ kind: 'delta', itemId: 'one', text: ' half a thought' });

    await act(async () => handlers.onClose());
    expect(await screen.findByText(sessionCopy.liveStopped)).toBeTruthy();
    // Recording was not touched.
    expect(voice.stop).not.toHaveBeenCalled();
    expect(voice.cancel).not.toHaveBeenCalled();
    await act(async () => tap?.(loud(1)));

    await stopTake();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await body()).toBe('Spoken after the take.'));
    expect(field().props.value).toBe('Spoken after the take.');
    expect(screen.queryByText(sessionCopy.liveStopped)).toBeNull();
  });

  it('falls back to the recording when the connection cannot be opened at all', async () => {
    openSocket.mockResolvedValue(null);
    await open();
    await startTake();
    await stopTake();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await body()).toBe('Spoken after the take.'));
  });

  it('hangs up the moment words are hidden, and the recording goes on', async () => {
    await open();
    await startTake();
    await waitFor(() => expect(openSocket).toHaveBeenCalled());
    await settle();

    await fireEvent.press(wordsControl());
    expect(socket.close).toHaveBeenCalled();
    expect(usePreferences.getState().wordsShown).toBe(false);
    expect(voice.stop).not.toHaveBeenCalled();
    expect(voice.cancel).not.toHaveBeenCalled();
    // The words follow, as a hidden take's do, after the take ends.
    await stopTake();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(sessionCopy.liveStopped)).toBeNull();
  });

  it('does not stream without the live agreement, even with words shown', async () => {
    usePreferences.setState({
      voiceConsent: { choice: 'voice_only', version: VOICE_POLICY_VERSION },
    });
    await open();
    await fireEvent.press(scenery());
    expect(await screen.findByText(sessionCopy.liveConsent.title)).toBeTruthy();
    expect(voice.start).not.toHaveBeenCalled();
    expect(openSocket).not.toHaveBeenCalled();
  });

  it('shows after-stop words in the sky when live is not available on this phone', async () => {
    (voice as unknown as { liveAvailable: boolean }).liveAvailable = false;
    await open();
    await startTake();
    expect(voice.start).toHaveBeenCalledWith(undefined);
    await stopTake();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(field().props.value).toBe('Spoken after the take.'));
    expect(openSocket).not.toHaveBeenCalled();
  });
});
