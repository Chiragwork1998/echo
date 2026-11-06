import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';

import type { DraftController } from '@/features/journal';
import { getEntry, notifyJournalChanged, openEntryAudio, saveDraft } from '@/features/journal/api';
import type { EntryAudio, PlayableAudio } from '@/features/journal/types';
import { transcribeEntryAudio, type TranscriptionErrorCode } from '@/services/transcription';
import { usePreferences, voiceStatus } from '@/state/preferences';

/** Why the words did not arrive. 'lost' is a take whose recording was replaced before it was sent. */
export type TranscriptionFailure = TranscriptionErrorCode | 'lost';

export type TranscriptionPhase =
  | { kind: 'idle' }
  /** The consent sheet is open. Nothing is sent until the person allows it. */
  | { kind: 'consent' }
  | { kind: 'listening' }
  | { kind: 'failed'; code: TranscriptionFailure };

export type ConsentChoice = 'allowed' | 'voice_only' | 'later';

/** The words join what is already there after a paragraph break. */
export function appendTranscript(body: string, text: string): string {
  const spoken = text.trim();
  if (spoken.length === 0) return body;
  const existing = body.replace(/\s+$/, '');
  return existing.length === 0 ? spoken : `${existing}\n\n${spoken}`;
}

/**
 * Failures that trying again will not mend: the recording is too long for the server, cannot be
 * read, or has no speech in it. Such a take stays put (the recording is safe, and the person is
 * told), but it never holds up the takes spoken after it.
 */
export const STUCK_CODES: readonly string[] = ['too_long', 'unsupported', 'no_speech'];

type Take = {
  /** Cannot become words however often it is tried. Dropped when the person records again. */
  stuck?: boolean;
  /** The recording this take is. The draft keeps only the newest one. */
  audioId: string;
  /**
   * A decrypted copy kept for a take that a newer recording is about to replace, so that its words
   * can still be sent or retried. Released the moment the take is done.
   */
  held: PlayableAudio | null;
};

// Which drafts have words on their way, and which session is sending them, so that a session
// reopened on the same draft does not send the same recording twice, and learns when the first one
// has landed.
const busy = new Map<string, string>();
const watchers = new Set<() => void>();
const changed = () => watchers.forEach((watcher) => watcher());
const subscribe = (watcher: () => void) => {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
};
const markBusy = (draftId: string, owner: string) => {
  busy.set(draftId, owner);
  changed();
};
const endBusy = (draftId: string, owner: string) => {
  if (busy.get(draftId) === owner) busy.delete(draftId);
  changed();
};

/**
 * Words that arrived after the session closed. They go straight into the stored draft, read fresh,
 * so nothing typed or saved since is overwritten. Returns false only if they could not be kept.
 */
async function storeTranscript(draftId: string, audioId: string, text: string): Promise<boolean> {
  const found = await getEntry(draftId);
  if (!found.ok) return false;
  const entry = found.value;
  // Discarded, or already kept as an echo: the person decided, and the words have nowhere to go.
  if (!entry || entry.status !== 'draft') return true;
  const saved = await saveDraft(draftId, {
    title: entry.title,
    body: appendTranscript(entry.body, text),
    mode: entry.mode,
    moodBefore: entry.moodBefore,
    promptId: entry.promptId,
    promptText: entry.promptText,
    durationSeconds: entry.durationSeconds,
    transcribedAudioId: audioId,
  });
  if (saved.ok) notifyJournalChanged();
  return saved.ok;
}

const heldSource = (copy: PlayableAudio) => async () => ({
  ok: true as const,
  // The take owns the copy until it is delivered, so a try that fails does not delete it.
  value: { uri: copy.uri, release: () => undefined },
});

/**
 * Turns each recording into words, one at a time and in the order they were spoken. A take whose
 * words have not come back never lets a later one in ahead of it, and never drops it: it waits
 * for Try again. The recording is already sealed on the phone before anything here runs, so a
 * failure costs nothing but the wait. If the session closes mid-request the request carries on and
 * the words go into the stored draft.
 */
export function useTranscription(draft: DraftController) {
  const [phase, setPhase] = useState<TranscriptionPhase>({ kind: 'idle' });
  const [arrival, setArrival] = useState(0);
  const me = useId();

  const live = useRef(draft);
  const text = useRef(draft.content.body);
  const alive = useRef(true);
  const queue = useRef<Take[]>([]);
  const running = useRef(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const asking = useRef<((choice: ConsentChoice) => void) | null>(null);
  const lost = useRef(false);
  const again = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    live.current = draft;
    text.current = draft.content.body;
  });

  const dropAll = useCallback(() => {
    for (const take of queue.current) take.held?.release();
    queue.current = [];
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      asking.current?.('later');
      // A request still running finishes the job and clears up after itself.
      if (!running.current) dropAll();
    };
  }, [dropAll]);

  const ask = useCallback(
    () =>
      new Promise<ConsentChoice>((resolve) => {
        asking.current = resolve;
        setPhase({ kind: 'consent' });
      }),
    [],
  );

  const deliver = useCallback(async (id: string, take: Take, spoken: string) => {
    if (!alive.current) return storeTranscript(id, take.audioId, spoken);
    const current = live.current;
    if (current.status !== 'ready') return false;
    const next = appendTranscript(text.current, spoken);
    text.current = next;
    current.update({ body: next, transcribedAudioId: take.audioId });
    setArrival((count) => count + 1);
    // Saved now, not at the next autosave: the words are the point of the recording.
    await current.flush();
    return true;
  }, []);

  const pump = useCallback(async () => {
    const id = live.current.id;
    if (running.current || !id) return;
    running.current = true;
    const mine = generation.current;
    const cancelled = () => generation.current !== mine;
    let outcome: TranscriptionPhase = { kind: 'idle' };
    markBusy(id, me);
    try {
      while (queue.current.length > 0 && !cancelled()) {
        const take = queue.current[0]!;

        let status = voiceStatus(usePreferences.getState().voiceConsent);
        if (status === 'unset') {
          const choice = await ask();
          if (cancelled()) break;
          status = choice === 'later' ? 'unset' : choice;
        }
        // Not allowed: the recording stays, sealed, and nothing is sent.
        if (status !== 'allowed') {
          dropAll();
          break;
        }

        // Replaced by a newer recording with no copy kept. Nothing can be sent, and nothing may block
        // the takes after it.
        if (!take.held && queue.current.length > 1) {
          lost.current = true;
          queue.current.shift();
          continue;
        }

        setPhase({ kind: 'listening' });
        const controller = new AbortController();
        request.current = controller;
        const copy = take.held;
        const result = await transcribeEntryAudio(id, {
          signal: controller.signal,
          open: copy ? heldSource(copy) : undefined,
        });
        request.current = null;
        if (cancelled()) break;

        if (!result.ok) {
          if (result.error.code === 'consent_required') {
            dropAll();
            break;
          }
          take.stuck = STUCK_CODES.includes(result.error.code);
          outcome = { kind: 'failed', code: result.error.code };
          break;
        }
        if (!(await deliver(id, take, result.value.text))) {
          outcome = { kind: 'failed', code: 'server' };
          break;
        }
        if (cancelled()) break;
        take.held?.release();
        take.held = null;
        queue.current.shift();
      }
    } finally {
      running.current = false;
      asking.current = null;
      endBusy(id, me);
    }

    if (cancelled()) {
      // Stopped by the person. A take added since is waiting for a loop that is no longer there.
      if (queue.current.length > 0) void again.current();
      return;
    }
    if (outcome.kind === 'idle') {
      dropAll();
      if (lost.current) {
        lost.current = false;
        outcome = { kind: 'failed', code: 'lost' };
      }
    }
    setPhase(outcome);
  }, [ask, deliver, dropAll, me]);
  useEffect(() => {
    again.current = pump;
  });

  /** A recording has just been sealed. Its words follow, after any take still ahead of it. */
  const enqueue = useCallback(
    (audio: EntryAudio) => {
      // The person has gone on to speak again: a take that could never be sent is let go of.
      for (const take of queue.current) if (take.stuck) take.held?.release();
      queue.current = queue.current.filter((take) => !take.stuck);
      queue.current.push({ audioId: audio.id, held: null });
      void pump();
    },
    [pump],
  );

  /** Try again: the take that failed, or the draft's recording when nothing has been sent. */
  const retry = useCallback(() => {
    const audio = live.current.audio;
    if (queue.current.length === 0 && audio) {
      queue.current.push({ audioId: audio.id, held: null });
    }
    void pump();
  }, [pump]);

  /**
   * Call before a new recording begins. A new recording replaces the draft's sealed one, so a take
   * still waiting on its words is given a decrypted copy to keep until it is done.
   */
  const holdCurrent = useCallback(async () => {
    const last = queue.current.at(-1);
    const id = live.current.id;
    if (!last || last.held || !id) return;
    const opened = await openEntryAudio(id);
    if (!opened.ok) return;
    if (queue.current.includes(last)) last.held = opened.value;
    else opened.value.release();
  }, []);

  const choose = useCallback((choice: ConsentChoice) => {
    if (choice !== 'later') usePreferences.getState().setVoiceConsent(choice);
    const answer = asking.current;
    asking.current = null;
    answer?.(choice);
  }, []);

  /** Go on without waiting. Whatever was sent is ignored, and the recording stays with the draft. */
  const abandon = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    asking.current?.('later');
    asking.current = null;
    dropAll();
    lost.current = false;
    setPhase({ kind: 'idle' });
  }, [dropAll]);

  /** For text typed in the moment before the next render, so arriving words never undo it. */
  const noteBody = useCallback((body: string) => {
    text.current = body;
  }, []);

  // Another session is sending this draft's recording. Wait for it rather than send it again.
  const draftId = draft.id;
  const sender = useSyncExternalStore(subscribe, () =>
    draftId ? (busy.get(draftId) ?? null) : null,
  );
  const elsewhere = sender !== null && sender !== me;
  const waited = useRef(false);
  useEffect(() => {
    if (elsewhere) {
      waited.current = true;
    } else if (waited.current) {
      // It has landed in the stored draft: take it from there.
      waited.current = false;
      void live.current.reload();
    }
  }, [elsewhere]);

  return {
    phase: elsewhere ? ({ kind: 'listening' } as const) : phase,
    /** Counts the times words have landed, so the page can let them in softly. */
    arrival,
    /** Words are on their way, or the question is open. */
    active: phase.kind === 'listening' || phase.kind === 'consent' || elsewhere,
    enqueue,
    retry,
    holdCurrent,
    choose,
    abandon,
    noteBody,
    /** A take is waiting, running or failed, so a later recording would replace its sealed audio. */
    hasQueue: () => queue.current.length > 0,
  };
}
