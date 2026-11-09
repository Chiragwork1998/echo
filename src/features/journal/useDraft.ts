import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { singleFlight, type Flight } from '@/storage/singleFlight';

import {
  commitEntry,
  discardDraft,
  forgetUnwrittenDraft,
  getEntry,
  latestDraft,
  newDraftId,
  notifyJournalChanged,
  saveDraft,
  takeLostRecordings,
} from './api';
import { canReflect, emptyContent, hasContent } from './content';
import {
  failure,
  success,
  type Entry,
  type EntryAudio,
  type EntryContent,
  type EntryPatch,
  type JournalError,
  type JournalResult,
} from './types';

/**
 * Measured from the first unsaved keystroke, not reset by the next one. A debounce that restarts on
 * every key would never fire for someone writing without pause, which is exactly when there is the
 * most to lose.
 */
export const AUTOSAVE_INTERVAL_MS = 600;

export type UseDraftOptions = {
  /** Open this draft. Omit to resume the newest readable draft, or start a new one. */
  draftId?: string;
  /** Applied only when a new draft is created. */
  seed?: EntryPatch;
};

export type DraftController = {
  status: 'loading' | 'ready' | 'error';
  /** Stable once status is ready. */
  id: string | null;
  content: EntryContent;
  audio: EntryAudio | null;
  /** 'error' means the last save failed. The text is still in `content`, and saving retries. */
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  commitState: 'idle' | 'committing' | 'error';
  error: JournalError | null;
  /** True for a draft that already existed, including one rescued from a crash. */
  resumed: boolean;
  /** Has anything worth asking about. Drives Back's Keep draft / Discard / Stay. */
  hasContent: boolean;
  /** Reflect is allowed: 10 non-space characters or 3 seconds of audio. */
  canReflect: boolean;
  /** Ignored until status is ready: keep the input disabled while loading. */
  update(patch: EntryPatch): void;
  /** Called by useVoiceRecorder once a recording is encrypted. */
  attachAudio(audio: EntryAudio): void;
  /** Saves now. Await before leaving the screen with Keep draft. */
  flush(): Promise<JournalResult<void>>;
  /** Saves and commits. Navigate only after ok: true. On failure the draft stays intact. */
  commit(patch?: EntryPatch): Promise<JournalResult<Entry>>;
  /** Removes the draft and its audio. */
  discard(): Promise<JournalResult<void>>;
  /** Tries again after status 'error'. */
  reload(): Promise<void>;
};

type Session = {
  id: string | null;
  content: EntryContent;
  audio: EntryAudio | null;
  /** A row exists, so even an emptied draft must be written rather than skipped. */
  stored: boolean;
  /** Loaded. A change before this would land on the empty seed and overwrite a real draft. */
  loaded: boolean;
  dirty: boolean;
  closed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  draining: Flight<JournalResult<void>>;
  committing: Flight<JournalResult<Entry>>;
};

/** Text exists that is not on disk yet. Closed sessions owe nothing: committed or discarded. */
const owesSave = (s: Session) => s.dirty && !s.closed && s.id !== null;

export function useDraft(options: UseDraftOptions = {}): DraftController {
  const { draftId, seed } = options;
  const [status, setStatus] = useState<DraftController['status']>('loading');
  const [content, setContent] = useState<EntryContent>(() => emptyContent(seed));
  const [audio, setAudio] = useState<EntryAudio | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<DraftController['saveState']>('idle');
  const [commitState, setCommitState] = useState<DraftController['commitState']>('idle');
  const [error, setError] = useState<JournalError | null>(null);
  const [resumed, setResumed] = useState(false);

  const session = useRef<Session>({
    id: null,
    content,
    audio: null,
    stored: false,
    loaded: false,
    dirty: false,
    closed: false,
    timer: null,
    draining: { current: null },
    committing: { current: null },
  });

  const clearTimer = useCallback(() => {
    const { timer } = session.current;
    if (timer) clearTimeout(timer);
    session.current.timer = null;
  }, []);

  /** Writes until caught up. Only one runs at a time, so saves land in the order they were made. */
  const drain = useCallback((): Promise<JournalResult<void>> => {
    const s = session.current;
    return singleFlight(s.draining, async () => {
      while (s.dirty && !s.closed && s.id) {
        s.dirty = false;
        // Nothing written yet and nothing to write: no empty rows in the journal.
        if (!s.stored && !hasContent(s.content, s.audio !== null)) break;
        setSaveState('saving');
        const saved = await saveDraft(s.id, s.content);
        if (!saved.ok) {
          s.dirty = true; // Keep it owed, so the next change, flush, or background retries.
          setSaveState('error');
          setError(saved.error);
          return failure(saved.error.code);
        }
        s.stored = true;
        setSaveState('saved');
        setError(null);
      }
      return success(undefined);
    });
  }, []);

  const flush = useCallback(async (): Promise<JournalResult<void>> => {
    const s = session.current;
    clearTimer();
    // A change can land after a run's last check and before it ends. That run answers ok for what
    // it wrote, so ok here waits until nothing at all is owed.
    for (;;) {
      const result = await drain();
      if (!result.ok || !owesSave(s)) return result;
    }
  }, [clearTimer, drain]);

  const applyLoaded = useCallback(
    async (found: JournalResult<Entry | null>) => {
      const s = session.current;
      if (!found.ok) {
        setError(found.error);
        setStatus('error');
        return;
      }
      const entry = found.value;
      if (entry && entry.status !== 'draft') {
        setError({ code: 'not_draft', retryable: false });
        setStatus('error');
        return;
      }
      if (entry) {
        const { id: entryId, audio: entryAudio = null } = entry;
        s.id = entryId;
        s.audio = entryAudio;
        s.stored = true;
        // A retry must not replace text typed since with what is on disk.
        if (!s.dirty) {
          s.content = pickContent(entry);
          setContent(s.content);
        }
        setId(entryId);
        setAudio(entryAudio);
        setResumed(true);
      } else if (!s.id) {
        const created = await newDraftId();
        if (!created.ok) {
          setError(created.error);
          setStatus('error');
          return;
        }
        s.id = draftId ?? created.value;
        setId(s.id);
      }
      s.loaded = true;
      // The first draft opened after the launch sweep is where this reaches the person. The session
      // carries on normally, and the next save clears it.
      setError(takeLostRecordings() > 0 ? { code: 'audio_failed', retryable: false } : null);
      setStatus('ready');
    },
    [draftId],
  );

  const reload = useCallback(async () => {
    setStatus('loading');
    await applyLoaded(await findDraft(draftId));
  }, [applyLoaded, draftId]);

  useEffect(() => {
    void findDraft(draftId).then(applyLoaded);
    // Runs once. Reopening a different draft means remounting with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = session.current;
    const subscription = AppState.addEventListener('change', (next) => {
      // Saved on the way out: after this the OS may end the process without warning.
      if (next !== 'active') void flush();
    });
    return () => {
      subscription.remove();
      // Home and the lists learn of a draft this session wrote. One that wrote nothing has nothing to tell
      // them, and a commit or a discard has told them already.
      void flush().then(() => {
        if (s.stored && !s.closed) notifyJournalChanged();
      });
    };
  }, [flush]);

  const update = useCallback(
    (patch: EntryPatch) => {
      const s = session.current;
      if (s.closed || !s.loaded) return;
      s.content = { ...s.content, ...patch };
      s.dirty = true;
      setContent(s.content);
      s.timer ??= setTimeout(() => {
        s.timer = null;
        void drain();
      }, AUTOSAVE_INTERVAL_MS);
    },
    [drain],
  );

  const attachAudio = useCallback(
    (next: EntryAudio) => {
      const s = session.current;
      s.audio = next;
      s.stored = true;
      setAudio(next);
      update({ mode: 'voice' });
    },
    [update],
  );

  const commit = useCallback(
    (patch: EntryPatch = {}): Promise<JournalResult<Entry>> => {
      const s = session.current;
      return singleFlight(s.committing, async () => {
        if (!s.id) return failure<Entry>('not_ready');
        clearTimer();
        s.content = { ...s.content, ...patch };
        setContent(s.content);
        setCommitState('committing');
        await s.draining.current;
        const committed = await commitEntry(s.id, s.content);
        if (committed.ok) {
          s.closed = true;
          s.dirty = false;
          setCommitState('idle');
          setError(null);
        } else {
          s.dirty = true;
          setCommitState('error');
          setError(committed.error);
          void drain(); // Protect the latest text as a draft while the user retries.
        }
        return committed;
      });
    },
    [clearTimer, drain],
  );

  const discard = useCallback(async (): Promise<JournalResult<void>> => {
    const s = session.current;
    clearTimer();
    s.closed = true; // Stops a pending save from recreating the row.
    await s.draining.current;
    if (!s.id) return success(undefined);
    // A draft never written is only forgotten: there is no row for anything on screen to drop.
    const removed = s.stored ? await discardDraft(s.id) : await forgetUnwrittenDraft(s.id);
    if (!removed.ok) {
      s.closed = false;
      setError(removed.error);
    }
    return removed;
  }, [clearTimer]);

  return {
    status,
    id,
    content,
    audio,
    saveState,
    commitState,
    error,
    resumed,
    hasContent: hasContent(content, audio !== null),
    canReflect: canReflect(content, audio ?? undefined),
    update,
    attachAudio,
    flush,
    commit,
    discard,
    reload,
  };
}

const findDraft = (id?: string) => (id ? getEntry(id) : latestDraft());

function pickContent(entry: Entry): EntryContent {
  const { title, body, mode, moodBefore, promptId, promptText, durationSeconds } = entry;
  const { transcribedAudioId } = entry;
  return {
    title,
    body,
    mode,
    moodBefore,
    promptId,
    promptText,
    durationSeconds,
    ...(transcribedAudioId ? { transcribedAudioId } : null),
  };
}
