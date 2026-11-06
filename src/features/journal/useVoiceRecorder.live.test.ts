import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { LIVE_RATE } from '@/services/liveAudio';
import { getMicrophonePermission } from '@/services/permissions';
import { wavHeader } from '@/services/wav';
import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';

import { setJournal } from './runtime';
import { createSqlJournal } from './sqlJournal';
import type { JournalResult } from './types';
import { useDraft } from './useDraft';
import { useVoiceRecorder } from './useVoiceRecorder';

// A live take is captured by the stream and written as a WAV, and is sealed and recovered exactly
// as a recording from the file recorder is. Only one of the two ever owns the microphone.

const SPOKEN = Buffer.from('the words I could only say out loud'.repeat(80));

type FakeStream = {
  id: string;
  start: jest.Mock;
  stop: jest.Mock;
  startFileRecordingAsync: jest.Mock;
  stopFileRecordingAsync: jest.Mock;
};
const fake: {
  stream: FakeStream | null;
  recorder: {
    prepareToRecordAsync: jest.Mock;
    record: jest.Mock;
    stop: jest.Mock;
    getStatus: jest.Mock;
    uri: string | null;
  } | null;
  onBuffer:
    | ((buffer: {
        data: ArrayBuffer;
        sampleRate: number;
        channels: number;
        timestamp: number;
      }) => void)
    | null;
  cache: string;
} = { stream: null, recorder: null, onBuffer: null, cache: '' };

jest.mock('expo-audio', () => ({
  RecordingPresets: {
    HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, android: { outputFormat: 'mpeg4' } },
  },
  useAudioRecorder: () => fake.recorder,
  useAudioStream: (options: { onBuffer: typeof fake.onBuffer }) => {
    fake.onBuffer = options.onBuffer;
    return { stream: fake.stream, isStreaming: false };
  },
  setAudioModeAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system', () => {
  const { join: joined } = jest.requireActual('node:path');
  const fs = jest.requireActual('node:fs');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = joined(
        ...parts.map((part) => (typeof part === 'string' ? part : (part as Directory).uri)),
      );
    }
    create() {
      fs.mkdirSync(this.uri, { recursive: true });
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = joined(
        ...parts.map((part) => (typeof part === 'string' ? part : (part as Directory).uri)),
      );
    }
    delete() {
      fs.rmSync(this.uri, { force: true });
    }
  }
  return {
    Directory,
    File,
    Paths: {
      get cache() {
        return { uri: fake.cache };
      },
    },
  };
});
jest.mock('@/services/permissions', () => ({
  getMicrophonePermission: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
}));

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

let rt: TestRuntime;
let journal: ReturnType<typeof createSqlJournal>;

/** What expo-audio's stream does on a device: a WAV appears at once, with a header that stays valid. */
function installStream() {
  let written = '';
  const stream: FakeStream = {
    id: 'stream-1',
    start: jest.fn(async () => undefined),
    stop: jest.fn(),
    startFileRecordingAsync: jest.fn(async ({ uri }: { uri: string }) => {
      mkdirSync(dirname(uri), { recursive: true });
      const header = wavHeader({ sampleRate: LIVE_RATE, channels: 1 }, SPOKEN.length);
      writeFileSync(uri, Buffer.concat([Buffer.from(header), SPOKEN]));
      written = uri;
      return { uri };
    }),
    stopFileRecordingAsync: jest.fn(async () => ({
      uri: written,
      duration: 12.5,
      size: SPOKEN.length + 44,
      sampleRate: LIVE_RATE,
      channels: 1,
      encoding: 'int16',
    })),
  };
  fake.stream = stream;
  return stream;
}
function installRecorder() {
  const directory = rt.paths.recordingDirs[0] ?? '';
  const recorder: NonNullable<typeof fake.recorder> = {
    uri: null,
    prepareToRecordAsync: jest.fn(async (options: { fileName: string }) => {
      mkdirSync(directory, { recursive: true });
      recorder.uri = join(directory, `${options.fileName}.aac`);
    }),
    record: jest.fn(() => writeFileSync(recorder.uri ?? '', SPOKEN)),
    stop: jest.fn(async () => undefined),
    getStatus: jest.fn(() => ({ durationMillis: 14_500 })),
  };
  fake.recorder = recorder;
  return recorder;
}

async function mount() {
  const view = await renderHook(() => {
    const draft = useDraft();
    return { draft, voice: useVoiceRecorder(draft) };
  });
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
  return view;
}
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
const recordings = async () =>
  (await rt.db.first<{ total: number }>('SELECT COUNT(*) AS total FROM recordings'))?.total;

beforeEach(async () => {
  rt = await createTestRuntime();
  fake.cache = join(rt.root, 'cache');
  journal = createSqlJournal(rt);
  setJournal(journal);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(
      () => ({ remove: () => undefined }) as ReturnType<typeof AppState.addEventListener>,
    );
  jest.mocked(getMicrophonePermission).mockResolvedValue({ status: 'granted', canAskAgain: true });
  installRecorder();
});
afterEach(() => {
  jest.restoreAllMocks();
  setJournal(null);
  fake.stream = null;
  fake.recorder = null;
  fake.onBuffer = null;
});

describe('a live take', () => {
  it('is captured by the stream alone, named by the ledger so a crash can find it', async () => {
    const stream = installStream();
    const view = await mount();
    expect(view.result.current.voice.liveAvailable).toBe(true);
    const tap = jest.fn();
    await act(async () => {
      expect(await view.result.current.voice.start({ tap })).toBeNull();
    });
    expect(view.result.current.voice.state).toBe('recording');

    // The microphone has one owner: the file recorder was never touched.
    expect(fake.recorder!.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(fake.recorder!.record).not.toHaveBeenCalled();
    expect(stream.start).toHaveBeenCalledTimes(1);
    const [{ uri, format }] = stream.startFileRecordingAsync.mock.calls[0] as [
      { uri: string; format: string },
    ];
    expect(format).toBe('wav');
    // In the folder the launch sweep looks in, as <ledger id>.wav.
    expect(dirname(uri)).toBe(rt.paths.recordingDirs[0]);
    const ledger = await rt.db.first<{ id: string }>('SELECT id FROM recordings');
    expect(uri.endsWith(`${ledger?.id}.wav`)).toBe(true);
    expect(existsSync(uri)).toBe(true);
  });

  it('hands the words 24 kHz mono, whatever the device gives, and tells them when capture ends', async () => {
    installStream();
    const view = await mount();
    const heard: (Int16Array | null)[] = [];
    await act(async () => {
      await view.result.current.voice.start({ tap: (samples) => heard.push(samples) });
    });
    // 48 kHz stereo from the device: 4800 frames of two channels.
    const stereo = new Int16Array(9600).fill(2000);
    await act(async () => {
      fake.onBuffer?.({ data: stereo.buffer, sampleRate: 48_000, channels: 2, timestamp: 0 });
    });
    const samples = heard[0] as Int16Array;
    expect(samples.length).toBe(2400);
    expect(samples.every((sample) => sample === 2000)).toBe(true);

    await act(async () => {
      await view.result.current.voice.stop();
    });
    expect(heard.at(-1)).toBeNull();
  });

  it('is sealed like any other recording: encrypted, the plaintext gone, the sweep has nothing left', async () => {
    installStream();
    const view = await mount();
    const tap = jest.fn();
    await act(async () => {
      await view.result.current.voice.start({ tap });
    });
    const ledger = await rt.db.first<{ id: string }>('SELECT id FROM recordings');
    const plaintext = join(rt.paths.recordingDirs[0] ?? '', `${ledger?.id}.wav`);
    expect(existsSync(plaintext)).toBe(true);

    await act(async () => {
      const audio = unwrap(await view.result.current.voice.stop());
      expect(audio.extension).toBe('.wav');
      expect(audio.durationSeconds).toBe(12.5);
    });
    // Capture ended first, so the words could be finished while the recording was sealed.
    expect(tap).toHaveBeenLastCalledWith(null);
    expect(existsSync(plaintext)).toBe(false);
    expect(await recordings()).toBe(0);
    expect(everyStoredByte(rt.root).includes(SPOKEN.subarray(0, 30))).toBe(false);
    expect(view.result.current.draft.audio?.extension).toBe('.wav');
    expect(view.result.current.draft.canReflect).toBe(true);
    expect(fake.stream!.stop).toHaveBeenCalled();
  });

  it('is rescued by the launch sweep after a crash, as a wav that plays up to the cut', async () => {
    installStream();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start({ tap: jest.fn() });
    });
    const { id } = view.result.current.draft;

    // The app dies: nothing is stopped. A fresh launch runs the sweep over what is on disk.
    const after = createSqlJournal(rt);
    const summary = await after.recoverLeftovers();
    expect(summary.recovered).toBe(1);
    expect(summary.failed).toBe(0);
    const recovered = unwrap(await after.getEntry(id ?? ''));
    expect(recovered?.audio).toMatchObject({ extension: '.wav', recovered: true });
    expect(existsSync(join(rt.paths.recordingDirs[0] ?? '', 'x'))).toBe(false);
    expect(await recordings()).toBe(0);
  });

  it('rescues the take if the screen closes mid-take', async () => {
    installStream();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start({ tap: jest.fn() });
    });
    const { id } = view.result.current.draft;
    await view.unmount();
    await settle();
    expect(unwrap(await journal.getEntry(id ?? ''))?.audio?.recovered).toBe(true);
  });

  it('records the ordinary way, and tells the words so, if the stream cannot start', async () => {
    const stream = installStream();
    stream.startFileRecordingAsync.mockRejectedValue(new Error('no file'));
    const view = await mount();
    const tap = jest.fn();
    await act(async () => {
      expect(await view.result.current.voice.start({ tap })).toBeNull();
    });
    expect(tap).toHaveBeenCalledWith(null);
    expect(stream.stop).toHaveBeenCalled();
    expect(fake.recorder!.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(view.result.current.voice.state).toBe('recording');

    await act(async () => {
      const audio = unwrap(await view.result.current.voice.stop());
      expect(audio.extension).toBe('.aac');
      expect(audio.durationSeconds).toBe(14.5);
    });
    expect(await recordings()).toBe(0);
  });

  it('uses the file recorder for a take that asks for no words', async () => {
    const stream = installStream();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    expect(stream.start).not.toHaveBeenCalled();
    expect(fake.recorder!.record).toHaveBeenCalledTimes(1);
  });

  it('cancelling a live take leaves nothing behind', async () => {
    installStream();
    const view = await mount();
    const tap = jest.fn();
    await act(async () => {
      await view.result.current.voice.start({ tap });
    });
    await act(async () => {
      await view.result.current.voice.cancel();
    });
    expect(tap).toHaveBeenLastCalledWith(null);
    expect(await recordings()).toBe(0);
    expect(view.result.current.voice.state).toBe('idle');
  });
});
