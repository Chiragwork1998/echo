import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { getMicrophonePermission } from '@/services/permissions';
import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';

import { setJournal } from './runtime';
import { createSqlJournal } from './sqlJournal';
import type { JournalResult } from './types';
import { useDraft } from './useDraft';
import { useVoiceRecorder } from './useVoiceRecorder';

const SPOKEN = 'the words I could only say out loud'.repeat(50);

type FakeRecorder = {
  uri: string | null;
  prepareToRecordAsync: jest.Mock;
  record: jest.Mock;
  stop: jest.Mock;
  getStatus: jest.Mock;
};

const mockRecorder: { current: FakeRecorder | null } = { current: null };

jest.mock('expo-audio', () => ({
  RecordingPresets: {
    HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, android: { outputFormat: 'mpeg4' } },
  },
  useAudioRecorder: () => mockRecorder.current,
  setAudioModeAsync: jest.fn(async () => undefined),
}));

jest.mock('@/services/permissions', () => ({
  getMicrophonePermission: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
}));

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

let rt: TestRuntime;
let journal: ReturnType<typeof createSqlJournal>;
let appStateHandlers: ((state: string) => void)[];

function installRecorder(): FakeRecorder {
  const directory = rt.paths.recordingDirs[0] ?? '';
  const recorder: FakeRecorder = {
    uri: null,
    prepareToRecordAsync: jest.fn(async (options: { fileName: string }) => {
      mkdirSync(directory, { recursive: true });
      recorder.uri = join(directory, `${options.fileName}.aac`);
    }),
    // Plaintext appears on disk as soon as the microphone is live, as on a device.
    record: jest.fn(() => writeFileSync(recorder.uri ?? '', SPOKEN)),
    stop: jest.fn(async () => undefined),
    getStatus: jest.fn(() => ({ durationMillis: 14_500 })),
  };
  mockRecorder.current = recorder;
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
  journal = createSqlJournal(rt);
  setJournal(journal);
  appStateHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandlers.push(handler as (state: string) => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
  jest.mocked(getMicrophonePermission).mockResolvedValue({ status: 'granted', canAskAgain: true });
});

afterEach(() => {
  jest.restoreAllMocks();
  setJournal(null);
  mockRecorder.current = null;
});

describe('useVoiceRecorder', () => {
  it('records to a file named by the ledger, so a crash can find it', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      expect(await view.result.current.voice.start()).toBeNull();
    });
    expect(view.result.current.voice.state).toBe('recording');
    const options = recorder.prepareToRecordAsync.mock.calls[0]?.[0];
    const ledger = await rt.db.first<{ id: string }>('SELECT id FROM recordings');
    expect(options.fileName).toBe(ledger?.id);
  });

  it('a double tap starts one recording', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      await Promise.all([view.result.current.voice.start(), view.result.current.voice.start()]);
    });
    expect(recorder.record).toHaveBeenCalledTimes(1);
    expect(await recordings()).toBe(1);
  });

  it('asks Android for ADTS, which stays playable if recording is cut off', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    expect(recorder.prepareToRecordAsync.mock.calls[0]?.[0].android).toMatchObject({
      outputFormat: 'aac_adts',
      extension: '.aac',
    });
  });

  it('never records into Documents, which the OS backs up', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    expect(recorder.prepareToRecordAsync.mock.calls[0]?.[0].directory).toBeUndefined();
  });

  it('encrypts on stop and deletes the plaintext immediately', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    const plaintext = recorder.uri ?? '';
    expect(existsSync(plaintext)).toBe(true);

    await act(async () => {
      const audio = unwrap(await view.result.current.voice.stop());
      expect(audio.durationSeconds).toBe(14.5);
    });

    expect(existsSync(plaintext)).toBe(false);
    expect(await recordings()).toBe(0);
    expect(everyStoredByte(rt.root).includes(SPOKEN.slice(0, 30))).toBe(false);
    expect(view.result.current.voice.state).toBe('idle');
    expect(view.result.current.draft.audio?.durationSeconds).toBe(14.5);
    expect(view.result.current.draft.canReflect).toBe(true);
  });

  it('marks the draft as a voice entry without flashing the screen to loading', async () => {
    installRecorder();
    const seen: string[] = [];
    const view = await renderHook(() => {
      const draft = useDraft();
      seen.push(draft.status);
      return { draft, voice: useVoiceRecorder(draft) };
    });
    await settle();
    await act(async () => {
      await view.result.current.voice.start();
    });
    seen.length = 0;
    await act(async () => {
      await view.result.current.voice.stop();
    });
    expect(seen).not.toContain('loading');
    await act(async () => {
      const entry = unwrap(await view.result.current.draft.commit());
      expect(entry.mode).toBe('voice');
    });
  });

  it('captures the duration before stopping, because it reads 0 afterwards', async () => {
    const recorder = installRecorder();
    recorder.stop.mockImplementation(async () => {
      recorder.getStatus.mockReturnValue({ durationMillis: 0 });
    });
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    await act(async () => {
      expect(unwrap(await view.result.current.voice.stop()).durationSeconds).toBe(14.5);
    });
  });

  it('does not prompt: without permission it reports what the screen must do', async () => {
    installRecorder();
    jest
      .mocked(getMicrophonePermission)
      .mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    const view = await mount();
    await act(async () => {
      expect(await view.result.current.voice.start()).toBe('permission_required');
    });
    expect(view.result.current.voice.state).toBe('idle');
    expect(await recordings()).toBe(0);
  });

  it('cleans up the ledger when the recorder cannot start', async () => {
    const recorder = installRecorder();
    recorder.prepareToRecordAsync.mockRejectedValue(new Error('microphone busy'));
    const view = await mount();
    await act(async () => {
      expect(await view.result.current.voice.start()).toBe('start_failed');
    });
    expect(await recordings()).toBe(0);
  });

  it('keeps the plaintext for the next launch when encryption fails', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    const plaintext = recorder.uri ?? '';
    setJournal({
      ...journal,
      attachRecording: async () => ({
        ok: false,
        error: { code: 'audio_failed', retryable: true },
      }),
    });

    await act(async () => {
      expect((await view.result.current.voice.stop()).ok).toBe(false);
    });

    expect(view.result.current.voice.state).toBe('error');
    expect(view.result.current.voice.error).toBe('save_failed');
    expect(existsSync(plaintext)).toBe(true);
    expect(await recordings()).toBe(1);

    setJournal(journal);
    expect((await journal.recoverLeftovers()).recovered).toBe(1);
    expect(existsSync(plaintext)).toBe(false);
  });

  it('encrypts when the app is backgrounded mid-recording', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    const plaintext = recorder.uri ?? '';

    await act(async () => {
      appStateHandlers.forEach((handler) => handler('background'));
    });
    await settle();

    expect(recorder.stop).toHaveBeenCalled();
    expect(existsSync(plaintext)).toBe(false);
    expect(view.result.current.draft.audio).not.toBeNull();
  });

  it('rescues the recording if the screen closes mid-recording', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    const plaintext = recorder.uri ?? '';
    const { id } = view.result.current.draft;

    await view.unmount();
    await settle();

    expect(existsSync(plaintext)).toBe(false);
    expect(unwrap(await journal.getEntry(id ?? ''))?.audio?.recovered).toBe(true);
  });

  it('cancelling leaves nothing behind', async () => {
    const recorder = installRecorder();
    const view = await mount();
    await act(async () => {
      await view.result.current.voice.start();
    });
    const plaintext = recorder.uri ?? '';

    await act(async () => {
      await view.result.current.voice.cancel();
    });

    expect(existsSync(plaintext)).toBe(false);
    expect(await recordings()).toBe(0);
    expect(rt.files.list(rt.paths.audioDir)).toEqual([]);
    expect(view.result.current.voice.state).toBe('idle');
  });

  it('keeps typed text alongside the audio', async () => {
    installRecorder();
    const view = await mount();
    await act(() => view.result.current.draft.update({ body: 'typed before speaking' }));
    await act(async () => {
      await view.result.current.voice.start();
    });
    await act(async () => {
      await view.result.current.voice.stop();
    });
    expect(view.result.current.draft.content.body).toBe('typed before speaking');
    await act(async () => {
      const entry = unwrap(await view.result.current.draft.commit());
      expect(entry.body).toBe('typed before speaking');
      expect(entry.audio).toBeDefined();
    });
  });

  it('reports itself unavailable without the native module', async () => {
    mockRecorder.current = null;
    const view = await mount();
    expect(view.result.current.voice.available).toBe(false);
    await act(async () => {
      expect(await view.result.current.voice.start()).toBe('unavailable');
    });
  });
});
