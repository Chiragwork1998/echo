import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getMicrophonePermission } from '@/services/permissions';

import { notifyJournalChanged } from './api';
import { useRecorderDriver } from './recorderDriver';
import { getJournal } from './runtime';
import { liveWords } from './liveWords';
import { useStreamDriver, type PcmTap } from './streamDriver';
import type { DraftController } from './useDraft';
import { failure, success, type EntryAudio, type JournalResult } from './types';

const ELAPSED_TICK_MS = 250;
/**
 * A live take whose stream has given nothing but exact zeros for this long goes on with the file recorder:
 * the system has silenced the stream (streamDriver.ts), and the recorder may still hear. A person who
 * has not begun to speak is not silence: a room is never exactly nothing.
 */
export const STREAM_PROOF_MS = 1200;
/** A take whose microphone has given nothing at all for this long says so: `deaf`. */
export const DEAF_MS = 3000;

export type VoiceErrorCode =
  /** Show the in-app explanation, then call requestMicrophonePermission. */
  | 'permission_required'
  /** The web preview, or a device without the native module. Offer Write. */
  | 'unavailable'
  | 'start_failed'
  /**
   * Encryption failed. The recording is kept and retried on the next launch, unless the OS clears
   * its cache first, which the next draft reports as audio_failed. Offer Write.
   */
  | 'save_failed';

export type StartOptions = {
  /**
   * Samples at 24 kHz mono as they are captured, then null once capture has ended. Giving one asks
   * for a live take: the microphone is then the stream, which also writes the recording as a WAV.
   * If the stream cannot start, the file recorder is used instead and the tap hears null at once.
   */
  tap?: PcmTap;
  /**
   * The stream heard nothing, and the take went on with the file recorder: its live words are over, and
   * its words will come from the recording once it ends.
   */
  onLiveLost?: () => void;
};

export type VoiceRecorder = {
  available: boolean;
  /** The microphone can be streamed, so a take can be heard live. */
  liveAvailable: boolean;
  state: 'idle' | 'starting' | 'recording' | 'saving' | 'error';
  elapsedSeconds: number;
  error: VoiceErrorCode | null;
  /**
   * The microphone has given nothing at all for a while, as when another app has it: Android hands a
   * silenced app zeros, not an error. Only ever true while recording, and false again once sound comes.
   */
  deaf: boolean;
  start(options?: StartOptions): Promise<VoiceErrorCode | null>;
  /** Stops and encrypts. The plaintext file is deleted before this resolves ok. */
  stop(): Promise<JournalResult<EntryAudio>>;
  /** Stops and throws the recording away. */
  cancel(): Promise<void>;
};

export function useVoiceRecorder(draft: DraftController): VoiceRecorder {
  const fileDriver = useRecorderDriver();
  const streamDriver = useStreamDriver();
  // Only one thing can own the microphone: this take is the file recorder or the stream.
  const engine = useRef<'file' | 'stream'>('file');
  const [state, setState] = useState<VoiceRecorder['state']>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<VoiceErrorCode | null>(null);
  const [deaf, setDeaf] = useState(false);
  const active = useRef<string | null>(null);
  const starting = useRef(false);
  // A live take's word that its stream is gone, and a change of recorder under way.
  const liveLost = useRef<(() => void) | null>(null);
  const switching = useRef<Promise<void> | null>(null);
  const latestDraft = useRef(draft);
  useEffect(() => {
    latestDraft.current = draft;
  });

  const start = useCallback(
    async (options?: StartOptions): Promise<VoiceErrorCode | null> => {
      const fail = (code: VoiceErrorCode) => {
        setError(code);
        setState(code === 'permission_required' ? 'idle' : 'error');
        return code;
      };
      if (!fileDriver && !streamDriver) return fail('unavailable');
      if (active.current || starting.current) return null;
      const { id } = latestDraft.current;
      if (!id) return fail('start_failed');

      starting.current = true;
      try {
        setState('starting');
        setError(null);
        const permission = await getMicrophonePermission();
        if (permission.status !== 'granted') return fail('permission_required');

        const journal = await getJournal();
        const begun = await journal.beginRecording(id);
        if (!begun.ok) return fail('start_failed');
        const recordingId = begun.value.recordingId;
        let used: 'file' | 'stream' | null = null;
        liveLost.current = null;
        if (options?.tap && streamDriver) {
          try {
            await streamDriver.begin(recordingId, options.tap);
            used = 'stream';
            liveLost.current = options.onLiveLost ?? null;
          } catch {
            // The ordinary recorder takes over, and this take simply has no live words.
            options.tap(null);
          }
        } else options?.tap?.(null);
        if (!used) {
          try {
            if (!fileDriver) throw new Error('no_recorder');
            await fileDriver.prepare(recordingId);
            fileDriver.record();
            used = 'file';
          } catch {
            await journal.abandonRecording(recordingId);
            return fail('start_failed');
          }
        }
        engine.current = used;
        active.current = recordingId;
        setElapsedSeconds(0);
        setDeaf(false);
        setState('recording');
        return null;
      } finally {
        starting.current = false;
      }
    },
    [fileDriver, streamDriver],
  );

  /**
   * The stream gave nothing but zeros: the take goes on with the file recorder, under the same ledger
   * entry, so it is sealed and recovered as any other. The recorder is made ready before the stream lets
   * go, so a recorder that cannot be readied leaves the take as it was, and the note says it is deaf.
   */
  const switchToFile = useCallback(() => {
    const recordingId = active.current;
    if (switching.current || engine.current !== 'stream' || !recordingId) return;
    if (!streamDriver || !fileDriver) return;
    switching.current = (async () => {
      try {
        await fileDriver.prepare(recordingId);
      } catch {
        return;
      }
      const lost = liveLost.current;
      liveLost.current = null;
      try {
        lost?.();
      } catch {
        // The words are not worth the recording.
      }
      // What the stream wrote is nothing but zeros, and goes.
      await streamDriver.discard().catch(() => undefined);
      try {
        fileDriver.record();
        engine.current = 'file';
      } catch {
        // Neither can record now. The take ends with nothing to keep, and says it could not start.
        active.current = null;
        const journal = await getJournal();
        await journal.abandonRecording(recordingId);
        setError('start_failed');
        setState('error');
      }
    })().finally(() => {
      switching.current = null;
    });
  }, [fileDriver, streamDriver]);

  const stop = useCallback(async (): Promise<JournalResult<EntryAudio>> => {
    // A change of recorder finishes first, so the recorder that is stopped is the one recording.
    if (switching.current) await switching.current;
    setDeaf(false);
    const recordingId = active.current;
    const { id, content } = latestDraft.current;
    const driver = engine.current === 'stream' ? streamDriver : fileDriver;
    if (!driver || !recordingId || !id) return failure('audio_failed');
    active.current = null;
    setState('saving');

    const journal = await getJournal();
    let attached: JournalResult<EntryAudio> = failure('audio_failed');
    try {
      const { uri, durationSeconds } = await driver.stop();
      if (uri) {
        attached = await journal.attachRecording({
          recordingId,
          uri,
          draftId: id,
          durationSeconds,
          content: { ...content, mode: 'voice' },
        });
      }
    } catch {
      // Handled below. The file and its ledger row are still in place for the launch sweep.
    }
    if (attached.ok) {
      setState('idle');
      latestDraft.current.attachAudio(attached.value);
      notifyJournalChanged();
      return success(attached.value);
    }
    setError('save_failed');
    setState('error');
    return attached;
  }, [fileDriver, streamDriver]);

  const cancel = useCallback(async () => {
    if (switching.current) await switching.current;
    setDeaf(false);
    const recordingId = active.current;
    active.current = null;
    if (recordingId) {
      const driver = engine.current === 'stream' ? streamDriver : fileDriver;
      await driver?.stop().catch(() => undefined);
      const journal = await getJournal();
      await journal.abandonRecording(recordingId);
    }
    setError(null);
    setState('idle');
  }, [fileDriver, streamDriver]);

  useEffect(() => {
    if (state !== 'recording') return;
    const tick = setInterval(() => {
      // Read each time: a take can change recorder part way.
      const driver = engine.current === 'stream' ? streamDriver : fileDriver;
      if (!driver || switching.current) return;
      setElapsedSeconds(driver.elapsedSeconds());
      if (
        engine.current === 'stream' &&
        !driver.heardAny() &&
        driver.quietForMs() >= STREAM_PROOF_MS
      ) {
        switchToFile();
        return;
      }
      setDeaf(driver.quietForMs() >= DEAF_MS);
    }, ELAPSED_TICK_MS);
    return () => clearInterval(tick);
  }, [fileDriver, streamDriver, state, switchToFile]);

  useEffect(() => {
    // Encrypt on the way out instead of leaving plaintext on disk until the next launch.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' && active.current) void stop();
    });
    return () => subscription.remove();
  }, [stop]);

  useEffect(
    () => () => {
      // The screen closed mid-recording. expo-audio has already released the recorder by the time
      // this cleanup runs, so stop() cannot be called. What it wrote is rescued from disk instead.
      const recordingId = active.current;
      active.current = null;
      if (recordingId) {
        void getJournal().then(async (journal) => {
          await journal.salvageRecording(recordingId);
          notifyJournalChanged();
        });
      }
    },
    [],
  );

  return {
    available: fileDriver !== null || streamDriver !== null,
    liveAvailable: liveWords.enabled && streamDriver !== null,
    state,
    elapsedSeconds,
    error,
    deaf: state === 'recording' && deaf,
    start,
    stop,
    cancel,
  };
}
