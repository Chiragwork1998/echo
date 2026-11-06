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
    // server rewraps .aac as .m4a before it goes on, with no re-encoding.
    android: { ...preset.android, extension: '.aac', outputFormat: 'aac_adts' },
    // MAX quality asks for more than a 40 kbps speech stream can carry. The bit rate is the limit.
    ios: { ...preset.ios, audioQuality: module.AudioQuality?.MEDIUM ?? 64 },
  };
}

const options = audio ? recordingOptions(audio) : null;
const useNoRecorder = () => null;
const useNativeRecorder: (options: RecordingOptions) => NativeRecorder | null =
  audio?.useAudioRecorder ?? useNoRecorder;

export type RecorderDriver = {
  prepare(fileName: string): Promise<void>;
  record(): void;
  elapsedSeconds(): number;
  stop(): Promise<{ uri: string | null; durationSeconds: number }>;
};

export const RECORDER_EXTENSION = Platform.OS === 'android' ? '.aac' : '.m4a';

export function useRecorderDriver(): RecorderDriver | null {
  const recorder = useNativeRecorder(options as RecordingOptions);
  return useMemo(() => {
    if (!recorder || !audio || !options) return null;
    const { setAudioModeAsync } = audio;
    const elapsedSeconds = () => recorder.getStatus().durationMillis / 1000;
    return {
      async prepare(fileName) {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync({ ...options, fileName });
      },
      record: () => recorder.record(),
      elapsedSeconds,
      async stop() {
        const durationSeconds = elapsedSeconds(); // Reads 0 once stopped.
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        return { uri: recorder.uri, durationSeconds };
      },
    };
  }, [recorder]);
}
