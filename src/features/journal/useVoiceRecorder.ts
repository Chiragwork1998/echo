import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getMicrophonePermission } from '@/services/permissions';

import { notifyJournalChanged } from './api';
import { useRecorderDriver } from './recorderDriver';
import { getJournal } from './runtime';
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

export type VoiceRecorder = {
  available: boolean;
  state: 'idle' | 'starting' | 'recording' | 'saving' | 'error';
  elapsedSeconds: number;
  error: VoiceErrorCode | null;
  start(): Promise<VoiceErrorCode | null>;
  /** Stops and encrypts. The plaintext file is deleted before this resolves ok. */
  stop(): Promise<JournalResult<EntryAudio>>;
  /** Stops and throws the recording away. */
  cancel(): Promise<void>;
};

export function useVoiceRecorder(draft: DraftController): VoiceRecorder {
  const driver = useRecorderDriver();
  const [state, setState] = useState<VoiceRecorder['state']>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<VoiceErrorCode | null>(null);
  const active = useRef<string | null>(null);
  const starting = useRef(false);
  const latestDraft = useRef(draft);
  useEffect(() => {
    latestDraft.current = draft;
  });

  const start = useCallback(async (): Promise<VoiceErrorCode | null> => {
    const fail = (code: VoiceErrorCode) => {
      setError(code);
      setState(code === 'permission_required' ? 'idle' : 'error');
      return code;
    };
    if (!driver) return fail('unavailable');
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
      try {
        await driver.prepare(begun.value.recordingId);
        driver.record();
      } catch {
        await journal.abandonRecording(begun.value.recordingId);
        return fail('start_failed');
      }
      active.current = begun.value.recordingId;
      setElapsedSeconds(0);
      setState('recording');
      return null;
    } finally {
      starting.current = false;
    }
  }, [driver]);

  const stop = useCallback(async (): Promise<JournalResult<EntryAudio>> => {
    const recordingId = active.current;
    const { id, content } = latestDraft.current;
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
  }, [driver]);

  const cancel = useCallback(async () => {
    const recordingId = active.current;
    active.current = null;
    if (recordingId) {
      await driver?.stop().catch(() => undefined);
      const journal = await getJournal();
      await journal.abandonRecording(recordingId);
    }
    setError(null);
    setState('idle');
  }, [driver]);

  useEffect(() => {
    if (state !== 'recording' || !driver) return;
    const tick = setInterval(() => setElapsedSeconds(driver.elapsedSeconds()), ELAPSED_TICK_MS);
    return () => clearInterval(tick);
  }, [driver, state]);

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
    available: driver !== null,
    state,
    elapsedSeconds,
    error,
    start,
    stop,
    cancel,
  };
}
