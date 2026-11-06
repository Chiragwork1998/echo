// A stand-in microphone for end-to-end runs, so a device with no real microphone (an emulator) still
// "hears" a real voice. Metro swaps this in for expo-audio only when ECHO_E2E=1 (metro.config.js), so
// no release bundle can contain it. Everything else in expo-audio is the real thing, and everything
// after capture is the app's own code: sealing, uploading, the voice server, the words, the page.
//
// The speech is synthetic (macOS `say`) and lives in assets/e2e. It holds no real person's words.
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { deactivateKeepAwake, ExpoKeepAwakeTag } from 'expo-keep-awake';
import { useEffect, useMemo, useState } from 'react';

// The two hooks below deliberately stand in for expo-audio's own.
// eslint-disable-next-line import/export
export * from 'expo-audio';

const HINDI = process.env.EXPO_PUBLIC_E2E_SPEECH === 'hi';
const AAC = HINDI
  ? require('../../../assets/e2e/speech-hi.aac')
  : require('../../../assets/e2e/speech-en.aac');
const WAV = HINDI
  ? require('../../../assets/e2e/speech-hi.wav')
  : require('../../../assets/e2e/speech-en.wav');

// Expo's development wrapper (expo/src/launch/withDevTools) holds the screen awake, under this tag, in
// every development build, Expo Go included. A release build does not, so left alone it hides every
// bug that a sleeping screen causes: an emulator under it never sleeps, however it is set. This file
// is only ever in an end-to-end run, so it lets go, and the screen sleeps as it does on a phone.
const letGoOfDevelopmentKeepAwake = () =>
  void deactivateKeepAwake(ExpoKeepAwakeTag).catch(() => undefined);
const lettingGo = setInterval(letGoOfDevelopmentKeepAwake, 2000) as unknown as {
  unref?: () => void;
};
lettingGo.unref?.();

const RATE = 24_000;
const WAV_HEADER = 44;
const TICK_MS = 100;
const TICK_BYTES = (RATE / 10) * 2;

async function localFile(module: number): Promise<File> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri);
}

// File.copy is asynchronous: it returns before the bytes are on disk. A caller that does not wait
// hands the app a path with no file behind it, which a slow disk turns into a failed save.
async function copyOver(from: File, to: File) {
  new Directory(Paths.cache, 'Audio').create({ idempotent: true, intermediates: true });
  if (to.exists) to.delete();
  await from.copy(to);
}

type RecorderOptions = { android?: { extension?: string } };

/**
 * "Records" for as long as it runs. The speech is put in its file when recording starts, as a real
 * recorder's first seconds are, so a take that is cut off mid-way leaves a file to be recovered.
 * stop() waits for that file to be whole.
 */
export function createRecorder(options: RecorderOptions) {
  let uri: string | null = null;
  let startedAt = 0;
  let written: Promise<void> = Promise.resolve();
  return {
    get uri() {
      return uri;
    },
    getStatus: () => ({ durationMillis: startedAt ? Date.now() - startedAt : 0 }),
    async prepareToRecordAsync({ fileName }: { fileName: string }) {
      const extension = options.android?.extension ?? '.aac';
      uri = new File(Paths.cache, 'Audio', `${fileName}${extension}`).uri;
    },
    record() {
      startedAt = Date.now();
      if (!uri) return;
      const target = new File(uri);
      written = localFile(AAC).then((from) => copyOver(from, target));
      // Reported by stop(). A take that is killed first never reaches it, and must not be an
      // unhandled rejection.
      written.catch(() => undefined);
    },
    async stop() {
      startedAt = 0;
      await written;
    },
  };
}

// eslint-disable-next-line import/export
export function useAudioRecorder(options: RecorderOptions) {
  return useMemo(() => createRecorder(options), [options]);
}

type StreamBuffer = {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
};
type StreamOptions = { onBuffer?: (buffer: StreamBuffer) => void };

/** Real speech at real speed, then quiet, for as long as the take runs. */
export function createStream() {
  let deliver: StreamOptions['onBuffer'];
  let timer: ReturnType<typeof setInterval> | null = null;
  let fileUri: string | null = null;
  let startedAt = 0;
  return {
    sampleRate: RATE,
    channels: 1,
    listen(onBuffer: StreamOptions['onBuffer']) {
      deliver = onBuffer;
    },
    get isStreaming() {
      return timer !== null;
    },
    async start() {
      const bytes = await (await localFile(WAV)).bytes();
      let at = WAV_HEADER;
      startedAt = Date.now();
      timer = setInterval(() => {
        const data = new Uint8Array(TICK_BYTES);
        data.set(bytes.subarray(at, at + TICK_BYTES));
        at += TICK_BYTES;
        deliver?.({
          data: data.buffer,
          sampleRate: RATE,
          channels: 1,
          timestamp: (Date.now() - startedAt) / 1000,
        });
      }, TICK_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    async startFileRecordingAsync(file: { uri: string }) {
      fileUri = file.uri;
      await copyOver(await localFile(WAV), new File(file.uri));
      return { uri: file.uri };
    },
    async stopFileRecordingAsync() {
      const uri = fileUri ?? '';
      fileUri = null;
      const duration = (Date.now() - startedAt) / 1000;
      return { uri, duration, size: new File(uri).size ?? 0, sampleRate: RATE };
    },
  };
}

// eslint-disable-next-line import/export
export function useAudioStream(options: StreamOptions) {
  const [stream] = useState(createStream);
  useEffect(() => stream.listen(options.onBuffer));
  return { stream, isStreaming: false };
}
