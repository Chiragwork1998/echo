import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';

import { copy } from '@/content/copy';
import {
  createMemoryJournal,
  setJournal,
  useVoiceRecorder,
  type Journal,
} from '@/features/journal';
import type { Entry, EntryAudio } from '@/features/journal/types';
import {
  transcribeEntryAudio,
  type TranscriptionErrorCode,
  type TranscriptionResult,
  type Transcript,
} from '@/services/transcription';
import { initialOnboarding, useOnboarding } from '@/state/onboarding';
import { usePreferences, VOICE_POLICY_VERSION } from '@/state/preferences';
import {
  backOutOfDialog,
  chooseInDialog,
  dialogChoices,
  dialogPrimary,
  renderWithDialogs,
  tapOutsideDialog,
} from '@/testing/dialogs';
import { render } from '@/testing/render';

import { JournalSession as Session } from './JournalSession';
import { sessionCopy } from './sessionCopy';

/** These tests are of the session itself, on the surfaces it had before the book. */
function JournalSession(props: ComponentProps<typeof Session>) {
  return <Session plain {...props} />;
}

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
}));
// The Plus check: whether the person has Plus once the paywall has had its say.
const mockRequirePlus = jest.fn((_feature: string) => false);
jest.mock('@/services/plus', () => ({
  ...jest.requireActual('@/services/plus'),
  useRequirePlus: () => mockRequirePlus,
}));

const send = jest.mocked(transcribeEntryAudio);

const AT = Date.parse('2026-11-06T09:00:00Z');
const RECORDED: EntryAudio = { id: 'a1', extension: '.m4a', durationSeconds: 6, recovered: false };
const said = (text: string): TranscriptionResult<Transcript> => ({
  ok: true,
  value: { text, polished: true, languages: ['en'], seconds: 3 },
});
const failed = (code: TranscriptionErrorCode): TranscriptionResult<Transcript> => ({
  ok: false,
  error: { code, retryable: code !== 'unauthorized' },
});
function pending() {
  let settle: (result: TranscriptionResult<Transcript>) => void = () => undefined;
  const promise = new Promise<TranscriptionResult<Transcript>>((resolve) => (settle = resolve));
  // The real service answers 'cancelled' as soon as it is told to stop.
  const request = (_id: string, options?: { signal?: AbortSignal }) => {
    options?.signal?.addEventListener('abort', () => settle(failed('cancelled')));
    return promise;
  };
  return { promise, settle, request };
}
const withRecording = (patch: Partial<Entry> = {}): Entry => ({
  id: 'draft-1',
  status: 'draft',
  body: '',
  mode: 'voice',
  durationSeconds: 6,
  createdAt: AT,
  updatedAt: AT,
  audio: RECORDED,
  ...patch,
});

type Voice = ReturnType<typeof useVoiceRecorder>;
let voice: Voice;
let journal: Journal;

const allowed = () =>
  usePreferences.setState({ voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION } });

beforeEach(() => {
  jest.clearAllMocks();
  useOnboarding.setState({ ...initialOnboarding, mode: undefined, mood: undefined });
  usePreferences.setState({ lastMode: 'speak', voiceConsent: null });
  journal = createMemoryJournal({ entries: [] });
  setJournal(journal);
  voice = {
    available: true,
    state: 'recording',
    elapsedSeconds: 4,
    error: null,
    start: jest.fn(async () => null),
    stop: jest.fn(async () => {
      voice.state = 'idle';
      return { ok: true, value: RECORDED };
    }),
    cancel: jest.fn(),
  } as unknown as Voice;
  jest.mocked(useVoiceRecorder).mockImplementation(() => voice);
});
afterEach(() => {
  setJournal(null);
  usePreferences.setState({ voiceConsent: null, lastMode: 'speak' });
});

const field = () => screen.getByLabelText(copy.firstEcho.title);
const stopRecording = async () => {
  await renderWithDialogs(<JournalSession variant="onboarding" />);
  await fireEvent.press(await screen.findByRole('button', { name: sessionCopy.speak.stop }));
};
const reopen = async (entry = withRecording()) => {
  journal = createMemoryJournal({ entries: [entry] });
  setJournal(journal);
  voice.state = 'idle';
  await renderWithDialogs(<JournalSession variant="onboarding" />);
};

describe('the consent question', () => {
  it('comes before the first upload, says what leaves the phone, and sends nothing yet', async () => {
    await stopRecording();
    expect(await screen.findByText(sessionCopy.consent.title)).toBeTruthy();
    for (const fact of sessionCopy.consent.facts) expect(screen.getByText(fact)).toBeTruthy();
    expect(screen.getByRole('button', { name: sessionCopy.consent.allow })).toBeTruthy();
    expect(screen.getByRole('button', { name: sessionCopy.consent.keep })).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('turns the voice into words once the person allows it, and the words stay editable', async () => {
    const request = pending();
    send.mockImplementation(request.request);
    await stopRecording();
    await fireEvent.press(await screen.findByRole('button', { name: sessionCopy.consent.allow }));
    // Quiet language while it works.
    expect(await screen.findByText(sessionCopy.transcribe.listening)).toBeTruthy();

    await act(async () => request.settle(said('I did not expect to feel this much.')));
    await waitFor(() => expect(field().props.value).toBe('I did not expect to feel this much.'));
    await fireEvent.changeText(field(), 'I did not expect to feel this much, and I do.');
    expect(field().props.value).toBe('I did not expect to feel this much, and I do.');
    expect(screen.queryByText(sessionCopy.transcribe.listening)).toBeNull();
  });

  it('keeps the voice on the phone with Keep my voice only, now and for the next recording', async () => {
    await stopRecording();
    await fireEvent.press(await screen.findByRole('button', { name: sessionCopy.consent.keep }));
    expect(usePreferences.getState().voiceConsent).toEqual({
      choice: 'voice_only',
      version: VOICE_POLICY_VERSION,
    });
    expect(screen.queryByText(sessionCopy.consent.title)).toBeNull();

    // The next recording, in a fresh session: the choice was remembered, so nothing is asked.
    voice.state = 'recording';
    await stopRecording();
    expect(screen.queryByText(sessionCopy.consent.title)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('when the words do not come', () => {
  beforeEach(allowed);

  it('says the recording is safe and offers Try again', async () => {
    send.mockResolvedValueOnce(failed('offline'));
    await stopRecording();
    expect(await screen.findByText(sessionCopy.transcribe.failed.offline)).toBeTruthy();
    send.mockResolvedValueOnce(said('There it is.'));
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.errors.retry }));
    await waitFor(() => expect(field().props.value).toBe('There it is.'));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each<[TranscriptionErrorCode, string]>([
    ['timeout', sessionCopy.transcribe.failed.timeout],
    ['server', sessionCopy.transcribe.failed.server],
    ['too_long', sessionCopy.transcribe.failed.tooLong],
    ['no_speech', sessionCopy.transcribe.failed.noSpeech],
  ])('says so calmly for %s', async (code, line) => {
    send.mockResolvedValueOnce(failed(code));
    await stopRecording();
    expect(await screen.findByText(line)).toBeTruthy();
    expect(screen.getByRole('button', { name: sessionCopy.errors.retry })).toBeTruthy();
    expect(line).toMatch(/safe/);
  });

  it.each<TranscriptionErrorCode>(['unauthorized', 'not_configured'])(
    'is calmly unavailable for %s, with no Try again and Write instead',
    async (code) => {
      send.mockResolvedValueOnce(failed(code));
      await stopRecording();
      expect(await screen.findByText(sessionCopy.transcribe.unavailable)).toBeTruthy();
      expect(screen.queryByRole('button', { name: sessionCopy.errors.retry })).toBeNull();
      expect(screen.getByRole('button', { name: sessionCopy.speak.writeInstead })).toBeTruthy();
    },
  );
});

describe('when this month’s free minutes are used', () => {
  beforeEach(allowed);
  const { allowance } = sessionCopy.transcribe;

  it('says the recording is safe, says why it is not words yet, and offers Plus or writing', async () => {
    send.mockResolvedValueOnce(failed('allowance_used'));
    await stopRecording();
    expect(await screen.findByText(sessionCopy.transcribe.untranscribed)).toBeTruthy();
    expect(screen.getByText(allowance.line)).toBeTruthy();
    expect(screen.getByRole('button', { name: allowance.plus })).toBeTruthy();
    expect(screen.getByRole('button', { name: sessionCopy.speak.writeInstead })).toBeTruthy();
    // Trying again would only be refused again: there is no Try again.
    expect(screen.queryByRole('button', { name: sessionCopy.errors.retry })).toBeNull();
    expect(allowance.line).toMatch(/60 free minutes/);
    expect(allowance.line).toMatch(/ECHO Plus, or next month/);
  });

  it('asks the Plus check for unlimited voice, and sends nothing while it says no', async () => {
    send.mockResolvedValueOnce(failed('allowance_used'));
    await stopRecording();
    await fireEvent.press(await screen.findByRole('button', { name: allowance.plus }));
    expect(mockRequirePlus).toHaveBeenCalledWith('voice-unlimited');
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByText(allowance.line)).toBeTruthy();
  });

  it('keeps the recording waiting, like an offline take, and sends it once Plus says yes', async () => {
    send.mockResolvedValueOnce(failed('allowance_used'));
    await stopRecording();
    await screen.findByRole('button', { name: allowance.plus });
    mockRequirePlus.mockReturnValueOnce(true);
    send.mockResolvedValueOnce(said('Words at last.'));
    await fireEvent.press(screen.getByRole('button', { name: allowance.plus }));
    await waitFor(() => expect(field().props.value).toBe('Words at last.'));
    expect(send).toHaveBeenCalledTimes(2);
    // The same recording, sent again.
    expect(send.mock.calls[1]![0]).toBe(send.mock.calls[0]![0]);
  });

  it('lets the person write instead, and sends nothing more', async () => {
    send.mockResolvedValueOnce(failed('allowance_used'));
    await stopRecording();
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.speak.writeInstead }),
    );
    await fireEvent.changeText(field(), 'Written, while the recording waits.');
    expect(field().props.value).toBe('Written, while the recording waits.');
    expect(send).toHaveBeenCalledTimes(1);
    expect(voice.cancel).not.toHaveBeenCalled();
  });

  it('says Plus’s monthly fair use plainly, with no Plus to offer and no Try again', async () => {
    send.mockResolvedValueOnce(failed('fair_use'));
    await stopRecording();
    expect(await screen.findByText(sessionCopy.transcribe.failed.fairUse)).toBeTruthy();
    expect(screen.queryByRole('button', { name: allowance.plus })).toBeNull();
    expect(screen.queryByRole('button', { name: sessionCopy.errors.retry })).toBeNull();
    expect(screen.getByRole('button', { name: sessionCopy.speak.writeInstead })).toBeTruthy();
  });
});

describe('speaking again after a recording that cannot become words', () => {
  it('asks before a new recording replaces it', async () => {
    allowed();
    send.mockResolvedValue(failed('too_long'));
    await reopen();
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.transcribe.action }),
    );
    expect(await screen.findByText(sessionCopy.transcribe.failed.tooLong)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.record }));
    expect(screen.getByRole('header', { name: sessionCopy.speak.replaceTitle })).toBeTruthy();
    expect(screen.getByText(sessionCopy.speak.replaceMessage)).toBeTruthy();
    expect(dialogChoices()).toEqual([sessionCopy.speak.replace, sessionCopy.speak.cancel]);
    expect(dialogPrimary()).toBe(sessionCopy.speak.replace);
    expect(voice.start).not.toHaveBeenCalled();
    await chooseInDialog(sessionCopy.speak.replace);
    expect(voice.start).toHaveBeenCalledTimes(1);
  });

  it('keeps the recording on Cancel, Back or a tap outside', async () => {
    allowed();
    send.mockResolvedValue(failed('too_long'));
    await reopen();
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.transcribe.action }),
    );
    await screen.findByText(sessionCopy.transcribe.failed.tooLong);
    const ask = () =>
      fireEvent.press(screen.getByRole('button', { name: sessionCopy.speak.record }));
    await ask();
    await chooseInDialog(sessionCopy.speak.cancel);
    await ask();
    await backOutOfDialog();
    await ask();
    await tapOutsideDialog();
    expect(voice.start).not.toHaveBeenCalled();
    expect(screen.getByText(sessionCopy.transcribe.failed.tooLong)).toBeTruthy();
  });
});

describe('a draft reopened with a recording that has no words', () => {
  it('can be retried, and the words join the page', async () => {
    allowed();
    send.mockResolvedValue(said('Back again.'));
    await reopen(withRecording({ body: 'Earlier.' }));
    expect(await screen.findByText(sessionCopy.transcribe.untranscribed)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: sessionCopy.transcribe.action }));
    await waitFor(() => expect(field().props.value).toBe('Earlier.\n\nBack again.'));
    expect(send).toHaveBeenCalledWith('draft-1', expect.anything());
  });

  it('asks before sending the first time, from the same action', async () => {
    send.mockResolvedValue(said('Back again.'));
    await reopen();
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.transcribe.action }),
    );
    expect(await screen.findByText(sessionCopy.consent.title)).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('is left alone for a person who chose to keep their voice only', async () => {
    usePreferences.setState({
      voiceConsent: { choice: 'voice_only', version: VOICE_POLICY_VERSION },
    });
    await reopen();
    expect(await screen.findByText(sessionCopy.speak.recorded)).toBeTruthy();
    expect(screen.queryByText(sessionCopy.transcribe.untranscribed)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not offer words again for a recording whose words are already in the page', async () => {
    allowed();
    await reopen(withRecording({ body: 'Already here.', transcribedAudioId: 'a1' }));
    expect(await screen.findByText(sessionCopy.speak.recorded)).toBeTruthy();
    expect(screen.queryByText(sessionCopy.transcribe.untranscribed)).toBeNull();
  });
});

describe('Reflect while the words are on their way', () => {
  beforeEach(allowed);

  const begin = async () => {
    const request = pending();
    send.mockImplementation(request.request);
    await reopen();
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.transcribe.action }),
    );
    await screen.findByText(sessionCopy.transcribe.listening);
    return request;
  };
  const reflect = () => screen.getByRole('button', { name: copy.firstEcho.cta });

  it('is never a trap: it asks, and Go on keeps the recording and stops waiting', async () => {
    await begin();
    const signal = (send.mock.calls[0]?.[1] as { signal: AbortSignal }).signal;
    await fireEvent.press(reflect());
    const { title, message, wait, goOn } = sessionCopy.transcribe.waiting;
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    // Waiting keeps the words, so it is what the question offers. Go on is the quiet way past it.
    expect(dialogChoices()).toEqual([wait, goOn]);
    expect(dialogPrimary()).toBe(wait);
    expect(router.navigate).not.toHaveBeenCalled();

    await chooseInDialog(goOn);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/completion'));
    expect(signal.aborted).toBe(true);
    const kept = await journal.latestEntry();
    expect(kept).toMatchObject({ ok: true, value: { hasAudio: true } });
  });

  it('decides nothing on Back or a tap outside: it waits for Wait or Go on', async () => {
    await begin();
    await fireEvent.press(reflect());
    await backOutOfDialog();
    await tapOutsideDialog();
    const { title, wait, goOn } = sessionCopy.transcribe.waiting;
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
    expect(dialogChoices()).toEqual([wait, goOn]);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(screen.getByText(sessionCopy.transcribe.listening)).toBeTruthy();
    // Answered, it goes on, and the words on their way are let go.
    await chooseInDialog(goOn);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/completion'));
  });

  it('waits when asked, and reflects with the words in the entry', async () => {
    const request = await begin();
    await fireEvent.press(reflect());
    await chooseInDialog(sessionCopy.transcribe.waiting.wait);
    expect(router.navigate).not.toHaveBeenCalled();

    await act(async () => request.settle(said('All of it, in my own voice.')));
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/completion'));
    const kept = await journal.getEntry('draft-1');
    expect(kept).toMatchObject({
      ok: true,
      value: { status: 'committed', body: 'All of it, in my own voice.', audio: { id: 'a1' } },
    });
  });

  it('does not wait on its own if the words fail while the person waits', async () => {
    const request = await begin();
    await fireEvent.press(reflect());
    await chooseInDialog(sessionCopy.transcribe.waiting.wait);
    await act(async () => request.settle(failed('offline')));
    expect(await screen.findByText(sessionCopy.transcribe.failed.offline)).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('after a failure asks whether to try again or go on, and Go on keeps the recording', async () => {
    send.mockResolvedValue(failed('offline'));
    await reopen();
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.transcribe.action }),
    );
    await screen.findByText(sessionCopy.transcribe.failed.offline);
    await fireEvent.press(reflect());
    const { title, message, retry, goOn } = sessionCopy.transcribe.missing;
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(dialogChoices()).toEqual([retry, goOn]);
    expect(dialogPrimary()).toBe(retry);
    // No way out but a choice: Back and a tap outside leave the question where it is.
    await backOutOfDialog();
    await tapOutsideDialog();
    expect(router.navigate).not.toHaveBeenCalled();
    await chooseInDialog(goOn);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/completion'));
  });

  it('after a failure, Try again sends the recording again and reflects once the words come', async () => {
    send.mockResolvedValueOnce(failed('offline'));
    await reopen();
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.transcribe.action }),
    );
    await screen.findByText(sessionCopy.transcribe.failed.offline);
    send.mockResolvedValueOnce(said('Here after all.'));
    await fireEvent.press(reflect());
    await chooseInDialog(sessionCopy.transcribe.missing.retry);
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith('/onboarding/completion'));
    expect(send).toHaveBeenCalledTimes(2);
    expect(await journal.getEntry('draft-1')).toMatchObject({
      ok: true,
      value: { status: 'committed', body: 'Here after all.' },
    });
  });
});

describe('leaving while the words are on their way', () => {
  it('keeps the draft, and the words still reach it', async () => {
    allowed();
    const request = pending();
    send.mockImplementation(request.request);
    // The recorder has sealed the take into the draft by now, as the real one does on stop.
    journal = createMemoryJournal({ entries: [withRecording({ body: 'Already here.' })] });
    setJournal(journal);
    voice.state = 'idle';
    const view = await render(<JournalSession variant="onboarding" />);
    await fireEvent.press(
      await screen.findByRole('button', { name: sessionCopy.transcribe.action }),
    );
    await screen.findByText(sessionCopy.transcribe.listening);
    await view.unmount();

    await act(async () => request.settle(said('Said on the way out.')));
    await waitFor(async () =>
      expect(await journal.latestDraft()).toMatchObject({
        ok: true,
        value: { body: 'Already here.\n\nSaid on the way out.', transcribedAudioId: 'a1' },
      }),
    );
  });
});
