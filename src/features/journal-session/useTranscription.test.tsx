import { act, renderHook } from '@testing-library/react-native';

import { createMemoryJournal, setJournal, useDraft, type Journal } from '@/features/journal';
import { openEntryAudio, saveDraft } from '@/features/journal/api';
import { failure, type Entry, type EntryAudio } from '@/features/journal/types';
import {
  transcribeEntryAudio,
  type TranscriptionErrorCode,
  type TranscriptionResult,
  type Transcript,
} from '@/services/transcription';
import { usePreferences, VOICE_POLICY_VERSION } from '@/state/preferences';

import { appendTranscript, useTranscription } from './useTranscription';

jest.mock('@/services/transcription', () => ({
  ...jest.requireActual('@/services/transcription'),
  transcribeEntryAudio: jest.fn(),
}));
jest.mock('@/features/journal/api', () => ({
  ...jest.requireActual('@/features/journal/api'),
  openEntryAudio: jest.fn(),
}));

const send = jest.mocked(transcribeEntryAudio);
const openAudio = jest.mocked(openEntryAudio);

const AT = Date.parse('2026-11-06T09:00:00Z');
const audio = (id: string): EntryAudio => ({
  id,
  extension: '.m4a',
  durationSeconds: 6,
  recovered: false,
});
const seeded = (patch: Partial<Entry> = {}): Entry => ({
  id: 'd1',
  status: 'draft',
  body: 'Before.',
  mode: 'voice',
  durationSeconds: 10,
  createdAt: AT,
  updatedAt: AT,
  audio: audio('a1'),
  ...patch,
});

const said = (text: string): TranscriptionResult<Transcript> => ({
  ok: true,
  value: { text, polished: true, languages: ['en'], seconds: 3 },
});
const failed = (code: TranscriptionErrorCode): TranscriptionResult<Transcript> => ({
  ok: false,
  error: { code, retryable: true },
});

/** A request the test settles by hand, so that order and timing are the test's to decide. */
function pending() {
  let settle: (result: TranscriptionResult<Transcript>) => void = () => undefined;
  const promise = new Promise<TranscriptionResult<Transcript>>((resolve) => (settle = resolve));
  return { promise, settle };
}

let journal: Journal;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  usePreferences.setState({
    voiceConsent: { choice: 'allowed', version: VOICE_POLICY_VERSION },
  });
  journal = createMemoryJournal({ entries: [seeded()] });
  setJournal(journal);
  openAudio.mockResolvedValue({ ok: false, error: { code: 'audio_failed', retryable: true } });
});
afterEach(() => {
  jest.useRealTimers();
  setJournal(null);
  usePreferences.setState({ voiceConsent: null });
});

const settle = () => act(async () => void (await jest.advanceTimersByTimeAsync(0)));
const stored = async (id = 'd1') => {
  const found = await journal.getEntry(id);
  if (!found.ok || !found.value) throw new Error('missing');
  return found.value;
};

async function mount() {
  const view = await renderHook(() => {
    const draft = useDraft({ draftId: 'd1' });
    return { draft, words: useTranscription(draft) };
  });
  await settle();
  expect(view.result.current.draft.status).toBe('ready');
  return view;
}

describe('appendTranscript', () => {
  it.each([
    ['Before.', 'Hello.', 'Before.\n\nHello.'],
    ['Before.\n\n  ', ' Hello. ', 'Before.\n\nHello.'],
    ['', 'Hello.', 'Hello.'],
    ['   \n', 'Hello.', 'Hello.'],
    ['Before.', '   ', 'Before.'],
  ])('joins %j and %j as %j', (body, text, expected) => {
    expect(appendTranscript(body, text)).toBe(expected);
  });
});

describe('consent before the first upload', () => {
  beforeEach(() => usePreferences.setState({ voiceConsent: null }));

  it('asks first, and sends nothing until the person allows it', async () => {
    send.mockResolvedValue(said('Hello.'));
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    expect(result.current.words.phase).toEqual({ kind: 'consent' });
    expect(send).not.toHaveBeenCalled();

    await act(async () => result.current.words.choose('allowed'));
    await settle();
    expect(usePreferences.getState().voiceConsent).toEqual({
      choice: 'allowed',
      version: VOICE_POLICY_VERSION,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.draft.content.body).toBe('Before.\n\nHello.');
  });

  it('never sends after Keep my voice only, then or later, and does not ask again', async () => {
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await act(async () => result.current.words.choose('voice_only'));
    await settle();
    expect(result.current.words.phase).toEqual({ kind: 'idle' });
    expect(usePreferences.getState().voiceConsent?.choice).toBe('voice_only');

    await act(async () => result.current.words.enqueue(audio('a2')));
    await settle();
    expect(result.current.words.phase).toEqual({ kind: 'idle' });
    expect(send).not.toHaveBeenCalled();
    expect(result.current.draft.content.body).toBe('Before.');
    expect(result.current.draft.audio).not.toBeNull();
  });

  it('closing the question decides nothing: no upload, nothing stored, asked again next time', async () => {
    send.mockResolvedValue(said('Hello.'));
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await act(async () => result.current.words.choose('later'));
    await settle();
    expect(result.current.words.phase).toEqual({ kind: 'idle' });
    expect(usePreferences.getState().voiceConsent).toBeNull();
    expect(send).not.toHaveBeenCalled();

    await act(async () => result.current.words.enqueue(audio('a1')));
    expect(result.current.words.phase).toEqual({ kind: 'consent' });
  });

  it('asks again when the policy has changed since the person agreed', async () => {
    usePreferences.setState({ voiceConsent: { choice: 'allowed', version: 0 } });
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    expect(result.current.words.phase).toEqual({ kind: 'consent' });
    expect(send).not.toHaveBeenCalled();
  });

  it('lets the session close with the question open, without sending', async () => {
    const view = await mount();
    await act(async () => view.result.current.words.enqueue(audio('a1')));
    await view.unmount();
    await settle();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('words arrive', () => {
  it('joins the text already there with a paragraph break, and saves at once', async () => {
    send.mockResolvedValue(said('Honestly, I am tired.'));
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await settle();

    expect(send).toHaveBeenCalledWith('d1', expect.objectContaining({ signal: expect.anything() }));
    expect(result.current.draft.content.body).toBe('Before.\n\nHonestly, I am tired.');
    expect(result.current.words.arrival).toBe(1);
    expect(result.current.words.phase).toEqual({ kind: 'idle' });
    // Already on disk: no autosave timer has run, and none is needed.
    const saved = await stored();
    expect(saved.body).toBe('Before.\n\nHonestly, I am tired.');
    expect(saved.transcribedAudioId).toBe('a1');
    expect(saved.audio?.id).toBe('a1');
  });

  it('stays fully editable: what is typed afterwards is kept, and so is what was typed meanwhile', async () => {
    const request = pending();
    send.mockReturnValue(request.promise);
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    expect(result.current.words.phase).toEqual({ kind: 'listening' });

    await act(async () => {
      result.current.words.noteBody('Before. And I kept typing');
      result.current.draft.update({ body: 'Before. And I kept typing' });
    });
    await act(async () => request.settle(said('Then this.')));
    await settle();
    expect(result.current.draft.content.body).toBe('Before. And I kept typing\n\nThen this.');

    await act(async () => {
      result.current.words.noteBody('Edited.');
      result.current.draft.update({ body: 'Edited.' });
    });
    await act(async () => void (await jest.advanceTimersByTimeAsync(700)));
    expect((await stored()).body).toBe('Edited.');
  });

  it('puts the first words in an empty page without a leading break', async () => {
    journal = createMemoryJournal({ entries: [seeded({ body: '' })] });
    setJournal(journal);
    send.mockResolvedValue(said('Hello.'));
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await settle();
    expect(result.current.draft.content.body).toBe('Hello.');
  });
});

describe('when the words do not come back', () => {
  it.each<TranscriptionErrorCode>([
    'offline',
    'timeout',
    'server',
    'too_long',
    'no_speech',
    'rate_limited',
    'unauthorized',
    'not_configured',
    'audio_unavailable',
  ])('on %s the page and the recording are untouched, and Try again works', async (code) => {
    send.mockResolvedValueOnce(failed(code));
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await settle();
    expect(result.current.words.phase).toEqual({ kind: 'failed', code });
    expect(result.current.draft.content.body).toBe('Before.');
    expect(result.current.draft.audio?.id).toBe('a1');
    expect((await stored()).audio?.id).toBe('a1');

    send.mockResolvedValueOnce(said('Second time.'));
    await act(async () => result.current.words.retry());
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.words.phase).toEqual({ kind: 'idle' });
    expect(result.current.draft.content.body).toBe('Before.\n\nSecond time.');
  });

  it('retries a reopened draft whose recording never became words', async () => {
    send.mockResolvedValue(said('Found them.'));
    const { result } = await mount();
    expect(result.current.draft.content.transcribedAudioId).toBeUndefined();
    await act(async () => result.current.words.retry());
    await settle();
    expect(send).toHaveBeenCalledWith('d1', expect.anything());
    expect(result.current.draft.content.body).toBe('Before.\n\nFound them.');
    expect((await stored()).transcribedAudioId).toBe('a1');
  });
});

describe('speaking several times', () => {
  it('sends one take at a time and appends them in the order they were spoken', async () => {
    const first = pending();
    const second = pending();
    send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = await mount();

    await act(async () => {
      result.current.words.enqueue(audio('a1'));
      result.current.words.enqueue(audio('a2'));
    });
    // The second take is already spoken, and waits behind the first.
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => first.settle(said('One.')));
    await settle();
    expect(result.current.draft.content.body).toBe('Before.\n\nOne.');
    expect(send).toHaveBeenCalledTimes(2);

    await act(async () => second.settle(said('Two.')));
    await settle();
    expect(result.current.draft.content.body).toBe('Before.\n\nOne.\n\nTwo.');
    expect((await stored()).transcribedAudioId).toBe('a2');
    expect(result.current.words.arrival).toBe(2);
    expect(result.current.words.phase).toEqual({ kind: 'idle' });
  });

  it('keeps a failed take ahead of the ones after it, and sends its kept copy again', async () => {
    const released = jest.fn();
    openAudio.mockResolvedValue({
      ok: true,
      value: { uri: 'file:///kept/one.m4a', release: released },
    });
    send.mockResolvedValueOnce(failed('offline'));
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await settle();
    expect(result.current.words.phase).toEqual({ kind: 'failed', code: 'offline' });

    // About to speak again: the recording that would be replaced is copied first.
    await act(async () => result.current.words.holdCurrent());
    expect(openAudio).toHaveBeenCalledWith('d1');

    send.mockResolvedValueOnce(said('One.')).mockResolvedValueOnce(said('Two.'));
    await act(async () => result.current.words.enqueue(audio('a2')));
    await settle();

    expect(send).toHaveBeenCalledTimes(3);
    // The first take was sent from its kept copy, not from the newer recording.
    const open = (
      send.mock.calls[1]?.[1] as {
        open?: (id: string) => Promise<{ ok: boolean; value: { uri: string } }>;
      }
    ).open;
    expect((await open?.('d1'))?.value.uri).toBe('file:///kept/one.m4a');
    expect(send.mock.calls[2]?.[1]).toEqual(
      expect.not.objectContaining({ open: expect.anything() }),
    );
    expect(result.current.draft.content.body).toBe('Before.\n\nOne.\n\nTwo.');
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('keeps a take and its kept copy when its words could not be saved, and saves them once on Try again', async () => {
    const released = jest.fn();
    openAudio.mockResolvedValue({
      ok: true,
      value: { uri: 'file:///kept/one.m4a', release: released },
    });
    send.mockResolvedValueOnce(failed('offline'));
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await settle();
    await act(async () => result.current.words.holdCurrent());

    // The words come back, and the phone cannot write them down.
    jest.spyOn(journal, 'saveDraft').mockResolvedValueOnce(failure('write_failed'));
    send.mockResolvedValueOnce(said('One.')).mockResolvedValueOnce(said('Two.'));
    await act(async () => result.current.words.enqueue(audio('a2')));
    await settle();
    expect(result.current.words.phase).toEqual({ kind: 'failed', code: 'server' });
    // The copy kept for this take is the only copy of that recording: it is not let go of.
    expect(released).not.toHaveBeenCalled();
    expect((await stored()).body).toBe('Before.');

    await act(async () => result.current.words.retry());
    await settle();
    // The words in hand are saved. They are not asked for again, and not added twice.
    expect(send).toHaveBeenCalledTimes(3);
    expect(result.current.words.phase).toEqual({ kind: 'idle' });
    expect(result.current.draft.content.body).toBe('Before.\n\nOne.\n\nTwo.');
    expect((await stored()).body).toBe('Before.\n\nOne.\n\nTwo.');
    expect(released).toHaveBeenCalledTimes(1);
  });

  it('says so, and carries on, when an earlier take was replaced with no copy kept', async () => {
    const first = pending();
    send.mockReturnValueOnce(first.promise).mockResolvedValueOnce(said('Two.'));
    const { result } = await mount();
    await act(async () => {
      result.current.words.enqueue(audio('a1'));
      result.current.words.enqueue(audio('a2'));
    });
    await act(async () => first.settle(failed('offline')));
    await settle();
    expect(result.current.words.phase).toEqual({ kind: 'failed', code: 'offline' });

    await act(async () => result.current.words.retry());
    await settle();
    // Nothing is blocked behind the lost take, and nothing is said to have arrived that did not.
    expect(result.current.draft.content.body).toBe('Before.\n\nTwo.');
    expect(result.current.words.phase).toEqual({ kind: 'failed', code: 'lost' });
  });
});

describe('a take that can never become words', () => {
  it.each(['too_long', 'unsupported', 'no_speech'] as const)(
    'on %s stays safe and never holds up the takes after it',
    async (code) => {
      send.mockResolvedValueOnce(failed(code)).mockResolvedValueOnce(said('Two.'));
      const { result } = await mount();
      await act(async () => result.current.words.enqueue(audio('a1')));
      await settle();
      expect(result.current.words.phase).toEqual({ kind: 'failed', code });
      expect(result.current.draft.audio?.id).toBe('a1');

      await act(async () => result.current.words.enqueue(audio('a2')));
      await settle();
      expect(send).toHaveBeenCalledTimes(2);
      expect(result.current.draft.content.body).toBe('Before.\n\nTwo.');
      expect(result.current.words.phase).toEqual({ kind: 'idle' });
    },
  );
});

describe('going on without waiting', () => {
  it('stops the request, adds nothing, and leaves the recording where it is', async () => {
    let signal: AbortSignal | undefined;
    send.mockImplementation(
      (_id, options) =>
        new Promise((resolve) => {
          signal = options?.signal;
          signal?.addEventListener('abort', () => resolve(failed('cancelled')));
        }),
    );
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await act(async () => result.current.words.abandon());
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(result.current.words.phase).toEqual({ kind: 'idle' });
    expect(result.current.draft.content.body).toBe('Before.');
    expect((await stored()).audio?.id).toBe('a1');
  });

  it('still takes the next recording afterwards', async () => {
    const stuck = pending();
    send.mockReturnValueOnce(stuck.promise).mockResolvedValueOnce(said('After.'));
    const { result } = await mount();
    await act(async () => result.current.words.enqueue(audio('a1')));
    await act(async () => result.current.words.abandon());
    await act(async () => result.current.words.enqueue(audio('a2')));
    await act(async () => stuck.settle(said('Stale words that must not appear.')));
    await settle();
    expect(result.current.draft.content.body).toBe('Before.\n\nAfter.');
  });
});

describe('when the session closes mid-request', () => {
  it('still puts the words into the stored draft, on top of what is there now', async () => {
    const request = pending();
    send.mockReturnValue(request.promise);
    const view = await mount();
    await act(async () => view.result.current.words.enqueue(audio('a1')));
    await act(async () => {
      view.result.current.draft.update({ body: 'Before. Typed just before leaving.' });
      await view.result.current.draft.flush();
    });
    await view.unmount();

    await act(async () => request.settle(said('Arrived late.')));
    await settle();
    const saved = await stored();
    expect(saved.body).toBe('Before. Typed just before leaving.\n\nArrived late.');
    expect(saved.transcribedAudioId).toBe('a1');
    expect(saved.audio?.id).toBe('a1');
  });

  it('does not overwrite text another session saved in the instant it was storing late words', async () => {
    const request = pending();
    send.mockReturnValue(request.promise);
    const view = await mount();
    await act(async () => view.result.current.words.enqueue(audio('a1')));
    await view.unmount();

    // A reopened session autosaves what was typed there, just after this one has read the draft.
    const real = journal.getEntry.bind(journal);
    let once = true;
    jest.spyOn(journal, 'getEntry').mockImplementation(async (id) => {
      const found = await real(id);
      if (once) {
        once = false;
        void saveDraft(id, {
          body: 'Before. Typed meanwhile.',
          mode: 'voice',
          durationSeconds: 10,
        });
      }
      return found;
    });
    await act(async () => request.settle(said('Arrived late.')));
    await settle();
    await settle();

    const saved = await stored();
    // What a person typed is never what is lost. The words may be written over by that other
    // session's older copy of the page, but then the draft does not claim to have them, and the
    // recording is still there for Try again.
    expect(saved.body).toContain('Typed meanwhile.');
    expect(saved.body.includes('Arrived late.') || saved.transcribedAudioId !== 'a1').toBe(true);
    expect(saved.audio?.id).toBe('a1');
  });

  it('does not bring back a draft that was discarded meanwhile', async () => {
    const request = pending();
    send.mockReturnValue(request.promise);
    const view = await mount();
    await act(async () => view.result.current.words.enqueue(audio('a1')));
    await view.unmount();
    await journal.discardDraft('d1');
    await act(async () => request.settle(said('Too late.')));
    await settle();
    expect(await journal.getEntry('d1')).toEqual({ ok: true, value: null });
  });

  it('leaves an entry that was already kept exactly as it was kept', async () => {
    const request = pending();
    send.mockReturnValue(request.promise);
    const view = await mount();
    await act(async () => view.result.current.words.enqueue(audio('a1')));
    await view.unmount();
    await journal.commitEntry('d1', { body: 'Kept.', mode: 'voice', durationSeconds: 10 });
    await act(async () => request.settle(said('Too late.')));
    await settle();
    expect((await stored()).body).toBe('Kept.');
  });

  it('lets go of the decrypted copies kept for earlier takes if the words fail after the session is gone', async () => {
    const released = jest.fn();
    openAudio.mockResolvedValue({
      ok: true,
      value: { uri: 'file:///kept/one.m4a', release: released },
    });
    send.mockResolvedValueOnce(failed('offline'));
    const view = await mount();
    await act(async () => view.result.current.words.enqueue(audio('a1')));
    await settle();
    await act(async () => view.result.current.words.holdCurrent());

    const request = pending();
    send.mockReturnValueOnce(request.promise);
    await act(async () => view.result.current.words.enqueue(audio('a2')));
    await view.unmount();
    expect(released).not.toHaveBeenCalled(); // The request is still running, and may yet succeed.

    await act(async () => request.settle(failed('offline')));
    await settle();
    // Nothing can retry it now, and a decrypted recording is not left in the cache for the next launch.
    expect(released).toHaveBeenCalledTimes(1);
    // The sealed recording is never what is let go of.
    const saved = await stored();
    expect(saved.audio?.id).toBe('a1');
    expect(saved.body).toBe('Before.');
  });

  it('leaves the recording retryable if the words never arrive', async () => {
    send.mockResolvedValue(failed('offline'));
    const view = await mount();
    await act(async () => view.result.current.words.enqueue(audio('a1')));
    await view.unmount();
    await settle();
    const saved = await stored();
    expect(saved.audio?.id).toBe('a1');
    expect(saved.transcribedAudioId).toBeUndefined();
  });
});

describe('a second session on the same draft', () => {
  it('does not send the recording twice, and shows the words once they land', async () => {
    const request = pending();
    send.mockReturnValue(request.promise);
    const first = await mount();
    await act(async () => first.result.current.words.enqueue(audio('a1')));
    await first.unmount();

    const second = await mount();
    expect(second.result.current.words.phase).toEqual({ kind: 'listening' });
    await act(async () => request.settle(said('From the first.')));
    await settle();
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(second.result.current.words.phase).toEqual({ kind: 'idle' });
    expect(second.result.current.draft.content.body).toBe('Before.\n\nFrom the first.');
  });
});
