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

export type StreamDriver = {
  /** Opens the microphone and starts writing the WAV. Throws if either cannot be done. */
  begin(fileName: string, tap: PcmTap): Promise<void>;
  elapsedSeconds(): number;
  /** Ends capture and finalises the WAV. The tap hears null before this resolves. */
  stop(): Promise<{ uri: string | null; durationSeconds: number }>;
};

export const STREAM_EXTENSION = '.wav';

export function useStreamDriver(): StreamDriver | null {
  const tapRef = useRef<PcmTap | null>(null);
  const resampler = useRef<{ rate: number; run: (input: Int16Array) => Int16Array } | null>(null);

  const { stream } = useNativeStream({
    sampleRate: LIVE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      const tap = tapRef.current;
      if (!tap) return;
      try {
        // The device may not give 24 kHz or mono, whatever was asked for.
        if (resampler.current?.rate !== buffer.sampleRate) {
          resampler.current = {
            rate: buffer.sampleRate,
            run: createResampler(buffer.sampleRate, LIVE_RATE),
          };
        }
        const mono = toMono(new Int16Array(buffer.data), buffer.channels);
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

    const removeFile = () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { File } = require('expo-file-system') as typeof import('expo-file-system');
        if (take.fileUri) new File(take.fileUri).delete();
      } catch {
        // Nothing to remove.
      }
    };

    return {
      async begin(fileName, tap) {
        const fileSystem = // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('expo-file-system') as typeof import('expo-file-system');
        const { Directory, File, Paths } = fileSystem;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        take.fileUri = null;
        resampler.current = null;
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
      async stop() {
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
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        return result;
      },
    };
  }, [stream]);
}
