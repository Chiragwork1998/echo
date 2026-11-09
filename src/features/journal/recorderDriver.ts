import { useMemo } from 'react';
import { Platform } from 'react-native';

// Honest about the plaintext window: the OS writes audio to a file as it is captured and no API here
// can encrypt mid-stream. So for the length of a recording, and until sealRecording finishes, the
// audio sits unencrypted in the app's private cache directory. The sandbox protects it from other
// apps but not from a rooted device or a forensic extraction of an unlocked phone.
//
// The cache directory is chosen on purpose. It is the OS's to purge under storage pressure, so a
// file left by a crash could in theory disappear before the launch sweep reaches it. But Documents
// is included in iCloud and Android Auto Backup, and that could carry plaintext off the device.
// Keeping plaintext off the network is the stronger promise, so cache it is.

type ExpoAudio = typeof import('expo-audio');
type NativeRecorder = ReturnType<ExpoAudio['useAudioRecorder']>;
type RecordingOptions = Parameters<ExpoAudio['useAudioRecorder']>[0];

function loadExpoAudio(): ExpoAudio | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-audio') as ExpoAudio;
  } catch {
    // expo-audio throws on import without its native module. Screens that merely import the journal
    // must keep working under Jest, where the recorder simply reports itself unavailable.
    return null;
  }
}

const audio = loadExpoAudio();

/**
 * Speech, not music. Mono at 22.05 kHz and 40 kbps keeps a minute of speech near 300 KB, so the
 * voice server's 4.4 MB limit is about 14 minutes (voice-api/api/transcribe.ts). It is also plenty
 * for transcription. Both platforms use the same numbers.
 */
export const SPEECH = { sampleRate: 22050, numberOfChannels: 1, bitRate: 40000 } as const;

export function recordingOptions(module: ExpoAudio): RecordingOptions {
  const preset = module.RecordingPresets.HIGH_QUALITY;
  return {
    ...preset,
    ...SPEECH,
    // MPEG-4 writes its index last, so a recording cut off by a crash cannot be played. ADTS frames
    // are self-contained: everything flushed before the crash survives. AVAudioRecorder has no
    // equivalent for AAC, so on iOS a crashed recording is preserved but may not play. The voice
    // server turns .aac into lossless FLAC before it goes on.
    android: { ...preset.android, extension: '.aac', outputFormat: 'aac_adts' },
    // MAX quality asks for more than a 40 kbps speech stream can carry. The bit rate is the limit.
    ios: { ...preset.ios, audioQuality: module.AudioQuality?.MEDIUM ?? 64 },
    // The level, so that a take can tell a quiet room from a microphone that gives it nothing.
    isMeteringEnabled: true,
  };
}

/**
 * The level a recorder reports when it was given nothing at all: Android's loudest sample since it was
 * last asked was exactly zero, which a room never is, and iOS's floor. A silenced capture reads this.
 */
export const SILENT_DB = -159;

/**
 * Whether this phone's recorder has reported a level above the floor since the app opened. A recorder
 * that only ever reports the floor may be one that does not measure at all, so a take is said to hear
 * nothing only on a phone whose recorder has shown it can tell.
 */
let levelsProven = false;
/** Tests only: forget that the levels were ever proven. */
export const forgetLevelsForTests = () => {
  levelsProven = false;
};

const options = audio ? recordingOptions(audio) : null;
const useNoRecorder = () => null;
const useNativeRecorder: (options: RecordingOptions) => NativeRecorder | null =
  audio?.useAudioRecorder ?? useNoRecorder;

export type RecorderDriver = {
  prepare(fileName: string): Promise<void>;
  record(): void;
  /** How long it has recorded. Each call also reads the level since the last one. */
  elapsedSeconds(): number;
  /** Whether any sound at all has come since recording began, as far as the calls above have read. */
  heardAny(): boolean;
  /** How long since the microphone last gave any sound, or since recording began if it never has. */
  quietForMs(): number;
  stop(): Promise<{ uri: string | null; durationSeconds: number }>;
};

export const RECORDER_EXTENSION = Platform.OS === 'android' ? '.aac' : '.m4a';

export function useRecorderDriver(): RecorderDriver | null {
  const recorder = useNativeRecorder(options as RecordingOptions);
  return useMemo(() => {
    if (!recorder || !audio || !options) return null;
    const { setAudioModeAsync } = audio;
    // When recording began, and when the level last said there was any sound.
    const sound = { since: 0, last: 0 };
    const elapsedSeconds = () => {
      const status = recorder.getStatus();
      // No level reported is not silence: only a level at the floor says the microphone gave nothing.
      if (typeof status.metering !== 'number') sound.last = Date.now();
      else if (status.metering > SILENT_DB) {
        sound.last = Date.now();
        levelsProven = true;
      }
      return status.durationMillis / 1000;
    };
    return {
      async prepare(fileName) {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync({ ...options, fileName });
      },
      record: () => {
        recorder.record();
        // Android's first level is always nothing: the loudest sample since a call there has not been.
        recorder.getStatus();
        Object.assign(sound, { since: Date.now(), last: 0 });
      },
      elapsedSeconds,
      heardAny: () => sound.last > 0,
      quietForMs: () => (levelsProven ? Date.now() - Math.max(sound.last, sound.since) : 0),
      async stop() {
        const durationSeconds = elapsedSeconds(); // Reads 0 once stopped.
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        return { uri: recorder.uri, durationSeconds };
      },
    };
  }, [recorder]);
}
