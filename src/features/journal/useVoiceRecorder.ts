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
};

export type VoiceRecorder = {
  available: boolean;
  /** The microphone can be streamed, so a take can be heard live. */
  liveAvailable: boolean;
  state: 'idle' | 'starting' | 'recording' | 'saving' | 'error';
  elapsedSeconds: number;
  error: VoiceErrorCode | null;
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
  const active = useRef<string | null>(null);
  const starting = useRef(false);
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
        if (options?.tap && streamDriver) {
          try {
            await streamDriver.begin(recordingId, options.tap);
            used = 'stream';
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
        setState('recording');
        return null;
      } finally {
        starting.current = false;
      }
    },
    [fileDriver, streamDriver],
  );

  const stop = useCallback(async (): Promise<JournalResult<EntryAudio>> => {
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
    const driver = engine.current === 'stream' ? streamDriver : fileDriver;
    if (state !== 'recording' || !driver) return;
    const tick = setInterval(() => setElapsedSeconds(driver.elapsedSeconds()), ELAPSED_TICK_MS);
    return () => clearInterval(tick);
  }, [fileDriver, streamDriver, state]);

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
    start,
    stop,
    cancel,
  };
}
