// The end-to-end microphone stand-in must have put its file on disk when the app looks for it. The
// platform's File.copy is asynchronous (expo-file-system 58), and a device that is slow to write
// exposed a stand-in that did not wait: the app sealed a recording that was not there yet.
import { createRecorder, createStream } from './expoAudio';

const mockFiles = new Set<string>();

jest.mock('expo-audio', () => ({}));
jest.mock('expo-keep-awake', () => ({
  ExpoKeepAwakeTag: 'ExpoKeepAwakeDefaultTag',
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: async () => undefined,
      localUri: 'file:///assets/speech',
      uri: 'http://metro/speech',
    }),
  },
}));
jest.mock('expo-file-system', () => {
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.has(this.uri) ? 1 : 0;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    // As on the device: it returns before the bytes are there.
    copy(to: { uri: string }): Promise<void> {
      return new Promise((resolve) =>
        setTimeout(() => {
          mockFiles.add(to.uri);
          resolve();
        }, 40),
      );
    }
    async bytes() {
      return new Uint8Array(48000);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    create() {}
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } };
});

const TARGET = 'file:///cache/Audio/take-1.aac';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => mockFiles.clear());

describe('the stand-in file recorder', () => {
  it('has its file on disk by the time stop resolves, however slowly the platform copies', async () => {
    const recorder = createRecorder({ android: { extension: '.aac' } });
    await recorder.prepareToRecordAsync({ fileName: 'take-1' });
    recorder.record();
    await recorder.stop();

    expect(mockFiles.has(TARGET)).toBe(true);
  });

  it('writes at record(), so a take cut off mid-way leaves what was said so far', async () => {
    const recorder = createRecorder({ android: { extension: '.aac' } });
    await recorder.prepareToRecordAsync({ fileName: 'take-1' });
    recorder.record();
    await sleep(120);

    expect(mockFiles.has(TARGET)).toBe(true);
  });
});

describe('the stand-in stream', () => {
  it('has the take written when startFileRecordingAsync resolves', async () => {
    const stream = createStream();
    await stream.startFileRecordingAsync({ uri: 'file:///cache/Audio/live-1.wav' });

    expect(mockFiles.has('file:///cache/Audio/live-1.wav')).toBe(true);
  });
});

describe("the stand-in and Expo's development keep-awake", () => {
  // Expo's development wrapper (expo/src/launch/withDevTools) holds the screen awake in every
  // development build, Expo Go included, and a release build does not. Left alone it hides every
  // bug a sleeping screen causes, so the stand-in, which is only ever in an end-to-end run, lets go.
  it('lets go of it, so the screen can sleep as it does on a phone', () => {
    jest.useFakeTimers();
    try {
      const keepAwake = jest.requireMock('expo-keep-awake');
      keepAwake.deactivateKeepAwake.mockClear();
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./expoAudio');
      });
      jest.advanceTimersByTime(2100);
      expect(keepAwake.deactivateKeepAwake).toHaveBeenCalledWith(keepAwake.ExpoKeepAwakeTag);
    } finally {
      jest.useRealTimers();
    }
  });
});
