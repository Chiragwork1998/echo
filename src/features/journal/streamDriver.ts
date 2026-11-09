import { useMemo, useRef } from 'react';

import { createResampler, LIVE_RATE, toMono } from '@/services/liveAudio';

// The microphone for a live take. Only one thing can own the microphone, so a take is either this
// stream or the file recorder (recorderDriver.ts), never both. The stream hands its samples to the
// words as they are captured and, at the same time, writes them to a WAV in the cache directory with
// expo-audio's own file recording. That file is sealed exactly as any recording is, and the launch
// sweep finds it by the same name (see sqlJournal.ts), so a crash still recovers the take. A WAV's
// header is kept valid while it is written, so a take cut short still plays up to the cut.
//
// Nothing the words do can stop the recording: the tap is called inside a catch.
//
// It also says whether the microphone is giving it any sound. Android does not refuse a capture it has
// decided another app should have: it hands over exact zeros (developer.android.com, "Sharing audio
// input"). A room is never that quiet, so a stream of nothing but zeros is a stream that cannot hear, and
// the take goes on with the file recorder instead (useVoiceRecorder.ts). On the owner's phone (2026-11-09)
// a live take came back as pure silence while the file recorder, two minutes before, heard every word.

type ExpoAudio = typeof import('expo-audio');
type StreamOptions = NonNullable<Parameters<ExpoAudio['useAudioStream']>[0]>;
type StreamHook = ExpoAudio['useAudioStream'];
type Stream = ReturnType<StreamHook>['stream'];

function loadExpoAudio(): ExpoAudio | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-audio') as ExpoAudio;
  } catch {
    // expo-audio throws on import without its native module, as under Jest.
    return null;
  }
}

const audio = loadExpoAudio();
const useNoStream = (_options?: StreamOptions) => ({ stream: null as unknown as Stream });
const useNativeStream: (options: StreamOptions) => { stream: Stream | null } =
  audio?.useAudioStream ?? useNoStream;

/** Samples at 24 kHz mono as they are captured, then null once capture has ended. */
export type PcmTap = (samples: Int16Array | null) => void;

/** Whether any sample is not exactly zero. A silenced capture is all zeros; a real one never is. */
export function hasSound(samples: Int16Array): boolean {
  for (let i = 0; i < samples.length; i += 1) if (samples[i] !== 0) return true;
  return false;
}

export type StreamDriver = {
  /** Opens the microphone and starts writing the WAV. Throws if either cannot be done. */
  begin(fileName: string, tap: PcmTap): Promise<void>;
  elapsedSeconds(): number;
  /** Whether any sound at all has come since the take began. */
  heardAny(): boolean;
  /** How long since the microphone last gave any sound, or since the take began if it never has. */
  quietForMs(): number;
  /** Ends capture and finalises the WAV. The tap hears null before this resolves. */
  stop(): Promise<{ uri: string | null; durationSeconds: number }>;
  /** Ends capture and deletes what it wrote: for a take that goes on with the file recorder. */
  discard(): Promise<void>;
};

export const STREAM_EXTENSION = '.wav';

export function useStreamDriver(): StreamDriver | null {
  const tapRef = useRef<PcmTap | null>(null);
  const resampler = useRef<{ rate: number; run: (input: Int16Array) => Int16Array } | null>(null);
  // When this take began, and when its microphone last gave anything but zeros.
  const sound = useRef({ since: 0, last: 0 });

  const { stream } = useNativeStream({
    sampleRate: LIVE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      const tap = tapRef.current;
      if (!tap) return;
      try {
        const captured = new Int16Array(buffer.data);
        if (hasSound(captured)) sound.current.last = Date.now();
        // The device may not give 24 kHz or mono, whatever was asked for.
        if (resampler.current?.rate !== buffer.sampleRate) {
          resampler.current = {
            rate: buffer.sampleRate,
            run: createResampler(buffer.sampleRate, LIVE_RATE),
          };
        }
        const mono = toMono(captured, buffer.channels);
        tap(resampler.current.run(mono));
      } catch {
        // The words are not worth the recording.
      }
    },
  });

  return useMemo<StreamDriver | null>(() => {
    if (!stream || !audio) return null;
    const { setAudioModeAsync } = audio;
    // What this take has so far. Held in an object so the closures below share one place for it.
    const take = { fileUri: null as string | null, startedAt: 0 };

    const removeFile = (uri: string | null = take.fileUri) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { File } = require('expo-file-system') as typeof import('expo-file-system');
        if (uri) new File(uri).delete();
      } catch {
        // Nothing to remove.
      }
    };

    // `release` hands the microphone back to the system's other uses. A take going on with the file
    // recorder keeps it, or iOS would no longer let that recorder record.
    const stop = async (release = true) => {
      const elapsed = take.startedAt ? (Date.now() - take.startedAt) / 1000 : 0;
      take.startedAt = 0;
      const result = { uri: take.fileUri, durationSeconds: elapsed };
      try {
        const finished = await stream.stopFileRecordingAsync();
        result.uri = finished.uri;
        result.durationSeconds = finished.duration;
      } catch {
        // stop() below finalises the file itself, and the URI from the start is still right.
      }
      try {
        stream.stop();
      } catch {
        // Already stopped.
      }
      const tap = tapRef.current;
      tapRef.current = null;
      try {
        tap?.(null);
      } catch {
        // The words are not worth the recording.
      }
      if (release) await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      return result;
    };

    return {
      async begin(fileName, tap) {
        const fileSystem = // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('expo-file-system') as typeof import('expo-file-system');
        const { Directory, File, Paths } = fileSystem;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        take.fileUri = null;
        resampler.current = null;
        sound.current = { since: Date.now(), last: 0 };
        tapRef.current = tap;
        try {
          await stream.start();
          // Where the launch sweep looks, so a crash leaves a take that can be rescued.
          new Directory(Paths.cache, 'Audio').create({ idempotent: true, intermediates: true });
          const target = new File(Paths.cache, 'Audio', `${fileName}${STREAM_EXTENSION}`);
          const started = await stream.startFileRecordingAsync({ uri: target.uri, format: 'wav' });
          take.fileUri = started.uri;
          take.startedAt = Date.now();
        } catch (error) {
          tapRef.current = null;
          try {
            stream.stop();
          } catch {
            // Already stopped.
          }
          removeFile();
          throw error;
        }
      },
      elapsedSeconds: () => (take.startedAt ? (Date.now() - take.startedAt) / 1000 : 0),
      heardAny: () => sound.current.last > 0,
      quietForMs: () => Date.now() - Math.max(sound.current.last, sound.current.since),
      stop: () => stop(),
      async discard() {
        const begun = take.fileUri;
        const { uri } = await stop(false);
        // Both names, in case the platform gave the finished file another spelling of the same place.
        removeFile(uri);
        if (begun !== uri) removeFile(begun);
        take.fileUri = null;
      },
    };
  }, [stream]);
}
