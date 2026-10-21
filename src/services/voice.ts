import * as Crypto from 'expo-crypto';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
  type RecordingStatus,
} from 'expo-audio';
import { Platform } from 'react-native';

import {
  audioFileExists,
  deleteFileIfPresent,
  encryptAudioFile,
} from '@/storage/audioStore';
import {
  beginRecordingSession,
  listRecoverableRecordingSessions,
  updateRecordingSession,
} from '@/storage/recordingSessionStore';
import { isEncryptionAvailable } from '@/storage/encryption';

/**
 * Voice capture boundary (`specs/PRODUCT_REQUIREMENTS.md` § Speak).
 *
 * Recording uses the platform recorder through `expo-audio`. Files are written
 * to the document directory so a system interruption cannot evict them, a
 * ledger row is created before the first sample, and the finished file is
 * re-encrypted with AES-256-GCM before its path is returned. If encryption is
 * unavailable the plaintext file is never referenced by journal persistence.
 *
 * Nothing here logs audio, duration or paths.
 */

export type VoiceDraft = {
  durationSeconds: number;
  /** Local encrypted file reference; null when capture failed. */
  localPath: string | null;
  /** Prompt context captured with the recording; used for interruption recovery. */
  promptId?: string | null;
  promptTextSnapshot?: string | null;
};

export type RecordingAvailability = 'available' | 'unavailable';
export type RecordingFailure =
  | 'permission'
  | 'recorder'
  | 'encryption'
  | 'storage'
  | null;

export interface VoiceCapturePort {
  availability(): Promise<RecordingAvailability>;
  start(meta?: { promptId: string; promptText: string }): Promise<RecordingAvailability>;
  stop(): Promise<VoiceDraft | null>;
  cancel(): void;
  isRecording(): boolean;
  lastFailure(): RecordingFailure;
  /** Re-encrypts a recording left behind by an interruption, if any. */
  recoverInterrupted(): Promise<VoiceDraft | null>;
}

type ActiveRecording = {
  id: string;
  recorder: RecorderWithEvents;
  startedAt: number;
  subscription: { remove: () => void };
};

type RecorderWithEvents = AudioRecorder & {
  addListener(
    eventName: 'recordingStatusUpdate',
    listener: (status: RecordingStatus) => void,
  ): { remove: () => void };
};

let active: ActiveRecording | null = null;
let stopping = false;
let failure: RecordingFailure = null;

function newId(): string {
  return Crypto.randomUUID();
}

/**
 * `expo-audio` expects platform-flattened options on the recorder instance but
 * the full preset when preparing the session; mirror its own conversion.
 */
function platformOptions(options: RecordingOptions): Partial<RecordingOptions> {
  const common = {
    extension: options.extension,
    sampleRate: options.sampleRate,
    numberOfChannels: options.numberOfChannels,
    bitRate: options.bitRate,
    directory: options.directory,
    isMeteringEnabled: options.isMeteringEnabled ?? false,
  };
  if (Platform.OS === 'ios') {
    return { ...common, ...options.ios };
  }
  if (Platform.OS === 'android') {
    return { ...common, ...options.android };
  }
  return { ...common, ...options.web };
}

function recordingOptions(): RecordingOptions {
  // `document` keeps partial recordings safe from cache eviction.
  return { ...RecordingPresets.HIGH_QUALITY, directory: 'document' };
}

type RecorderConstructor = new (options: Partial<RecordingOptions>) => RecorderWithEvents;

/**
 * `expo-audio` exposes the recorder class as a property of the native module
 * rather than as a package export, so the constructor is reached indirectly.
 */
function recorderConstructor(): RecorderConstructor {
  const nativeModule = AudioModule as unknown as { AudioRecorder: RecorderConstructor };
  return nativeModule.AudioRecorder;
}

function durationSecondsOf(recorder: AudioRecorder): number {
  const status = recorder.getStatus();
  const seconds = status.durationMillis > 0 ? status.durationMillis / 1000 : recorder.currentTime;
  return Math.max(0, Math.round(seconds));
}

async function handleUnexpectedStop(current: ActiveRecording): Promise<void> {
  if (stopping || active?.id !== current.id) {
    return;
  }
  // The OS ended the session (call, media reset, background kill). Keep the
  // partial file and let the next launch finish encrypting it.
  active = null;
  const path = current.recorder.uri;
  await updateRecordingSession(current.id, {
    durationSeconds: durationSecondsOf(current.recorder),
    path,
    status: path ? 'pending-encryption' : 'interrupted-missing',
  });
}

export const voiceCapture: VoiceCapturePort = {
  async availability() {
    try {
      recorderConstructor();
      return 'available';
    } catch {
      return 'unavailable';
    }
  },

  async start(meta) {
    if (active) {
      return 'available';
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const options = recordingOptions();
      // `useAudioRecorder` is hook-bound; the recorder class on the module is
      // the imperative equivalent for a non-React service.
      const Recorder = recorderConstructor();
      const recorder = new Recorder(platformOptions(options));
      await recorder.prepareToRecordAsync(options);
      const id = newId();
      await beginRecordingSession(id, recorder.uri ?? null, meta);
      const subscription = recorder.addListener('recordingStatusUpdate', (status: RecordingStatus) => {
        const ongoing = active;
        if ((status.isFinished || status.mediaServicesDidReset) && ongoing?.id === id) {
          void handleUnexpectedStop(ongoing);
        }
      });
      recorder.record();
      active = { id, recorder, startedAt: Date.now(), subscription };
      failure = null;
      return 'available';
    } catch {
      failure = 'recorder';
      return 'unavailable';
    }
  },

  async stop() {
    const current = active;
    if (!current) {
      return null;
    }
    stopping = true;
    try {
      await current.recorder.stop();
      const uri = current.recorder.uri;
      const durationSeconds = durationSecondsOf(current.recorder);
      await updateRecordingSession(current.id, { durationSeconds });
      if (!uri || !audioFileExists(uri)) {
        await updateRecordingSession(current.id, { status: 'interrupted-missing' });
        failure = 'recorder';
        return null;
      }
      if (!(await isEncryptionAvailable())) {
        await updateRecordingSession(current.id, {
          durationSeconds,
          path: uri,
          status: 'pending-encryption',
        });
        failure = 'encryption';
        return null;
      }
      const encrypted = await encryptAudioFile(uri, current.id);
      if (!encrypted) {
        await updateRecordingSession(current.id, {
          durationSeconds,
          path: uri,
          status: 'pending-encryption',
        });
        failure = 'encryption';
        return null;
      }
      await updateRecordingSession(current.id, {
        durationSeconds,
        encryptedPath: encrypted.path,
        status: 'encrypted',
      });
      failure = null;
      return { durationSeconds, localPath: encrypted.path };
    } catch {
      failure = 'storage';
      return null;
    } finally {
      stopping = false;
      if (active?.id === current.id) {
        current.subscription.remove();
        active = null;
      }
    }
  },

  cancel() {
    const current = active;
    active = null;
    if (!current) {
      return;
    }
    stopping = true;
    current.subscription.remove();
    void (async () => {
      try {
        await current.recorder.stop();
      } catch {
        // Already stopped by the interruption handler.
      }
      deleteFileIfPresent(current.recorder.uri);
      await updateRecordingSession(current.id, { status: 'discarded' });
      stopping = false;
    })();
  },

  isRecording() {
    return active !== null;
  },

  lastFailure() {
    return failure;
  },

  async recoverInterrupted() {
    let sessions: Awaited<ReturnType<typeof listRecoverableRecordingSessions>> = [];
    try {
      sessions = await listRecoverableRecordingSessions();
    } catch {
      return null;
    }
    for (const session of sessions) {
      if (session.encryptedPath && audioFileExists(session.encryptedPath)) {
        await updateRecordingSession(session.id, { status: 'encrypted' });
        return {
          durationSeconds: session.durationSeconds,
          localPath: session.encryptedPath,
          promptId: session.promptId,
          promptTextSnapshot: session.promptText,
        };
      }
      const path = session.path;
      if (!path || !audioFileExists(path)) {
        await updateRecordingSession(session.id, { status: 'interrupted-missing' });
        continue;
      }
      if (!(await isEncryptionAvailable())) {
        return null;
      }
      try {
        const encrypted = await encryptAudioFile(path, session.id);
        if (!encrypted) {
          return null;
        }
        await updateRecordingSession(session.id, {
          encryptedPath: encrypted.path,
          status: 'encrypted',
        });
        return {
          durationSeconds: session.durationSeconds,
          localPath: encrypted.path,
          promptId: session.promptId,
          promptTextSnapshot: session.promptText,
        };
      } catch {
        continue;
      }
    }
    return null;
  },
};
