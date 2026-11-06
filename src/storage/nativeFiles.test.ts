// expoFiles against a stand-in for the device's file handles (testing/fakeExpoFileSystem.ts follows
// the Kotlin and Swift in node_modules). Jest cannot run the real ones, so these pin how the adapter
// uses them: the mistakes that matter here (a read at the wrong offset, a handle left open, a write
// that does not empty the file first) are silent on a phone.
import { DecryptionError } from './envelope';
import { expoFiles } from './nativePorts';
import { openSealedAudio, sealAudioFile } from './sealedAudio';
import { control } from './testing/fakeExpoFileSystem';
import { expectBytes } from './testing/expectBytes';
import { nodeAes } from './testing/nodePorts';

jest.mock('expo-file-system', () => jest.requireActual('./testing/fakeExpoFileSystem'));
jest.mock('expo-crypto', () => ({}));
jest.mock('expo-secure-store', () => ({}));

const DIR = 'file:///documents/echo/audio';
const sequence = (length: number) => Uint8Array.from({ length }, (_, index) => (index * 7) % 251);

beforeEach(() => control.reset());

describe('expoFiles.openReader', () => {
  it('opens read-only, seeks before every read, and returns exactly the range', async () => {
    control.put(`${DIR}/a.bin`, sequence(1000));
    const reader = expoFiles.openReader(`${DIR}/a.bin`);

    expect(reader.size).toBe(1000);
    expectBytes(await reader.read(600, 50), sequence(1000).slice(600, 650));
    expectBytes(await reader.read(0, 10), sequence(1000).slice(0, 10));
    expect(control.modes).toEqual(['r']);
    expect(control.offsets).toEqual([600, 0]);
    reader.close();
    expect(control.open).toBe(0);
  });

  it('puts together a read the device returned in pieces', async () => {
    control.put(`${DIR}/a.bin`, sequence(1000));
    control.maxRead = 7;
    const reader = expoFiles.openReader(`${DIR}/a.bin`);
    expectBytes(await reader.read(100, 300), sequence(1000).slice(100, 400));
    expect((await reader.read(100, 300)).buffer.byteLength).toBe(300);
    reader.close();
  });

  it('gives back what there is at the end of the file, and nothing past it', async () => {
    control.put(`${DIR}/a.bin`, sequence(100));
    control.maxRead = 7;
    const reader = expoFiles.openReader(`${DIR}/a.bin`);
    expectBytes(await reader.read(90, 50), sequence(100).slice(90));
    expect((await reader.read(100, 50)).length).toBe(0);
    expect((await reader.read(5000, 50)).length).toBe(0);
    expect((await reader.read(0, 0)).length).toBe(0);
    reader.close();
  });

  it('can be closed twice, and refuses a file that is not there', () => {
    control.put(`${DIR}/a.bin`, sequence(10));
    const reader = expoFiles.openReader(`${DIR}/a.bin`);
    reader.close();
    expect(() => reader.close()).not.toThrow();
    expect(() => expoFiles.openReader(`${DIR}/missing.bin`)).toThrow();
    expect(control.open).toBe(0);
  });
});

describe('expoFiles.openWriter', () => {
  it('creates the folders, empties an existing file, and appends what it is given', async () => {
    control.put(`${DIR}/a.bin`, sequence(500));
    const writer = expoFiles.openWriter(`${DIR}/a.bin`);
    await writer.write(Uint8Array.of(1, 2, 3));
    await writer.write(Uint8Array.of(4, 5));
    writer.close();
    expect([...(control.get(`${DIR}/a.bin`) ?? [])]).toEqual([1, 2, 3, 4, 5]);
    expect(control.modes).toEqual(['w']);
    expect(control.open).toBe(0);
    expect(control.folders.has(DIR)).toBe(true);
  });

  it('writes into a folder that does not exist yet', async () => {
    const writer = expoFiles.openWriter('file:///cache/echo-temp/x/copy.m4a');
    await writer.write(Uint8Array.of(9));
    writer.close();
    expect(control.has('file:///cache/echo-temp/x/copy.m4a')).toBe(true);
  });
});

describe('expoFiles.size and move', () => {
  it('reports a size, and refuses a file that is not there', () => {
    control.put(`${DIR}/a.bin`, sequence(321));
    expect(expoFiles.size(`${DIR}/a.bin`)).toBe(321);
    expect(() => expoFiles.size(`${DIR}/missing.bin`)).toThrow();
  });

  it('moves over a file that is already there, making the folder if it must', async () => {
    control.put(`${DIR}/new.tmp`, Uint8Array.of(1, 2, 3));
    control.put(`${DIR}/new.enc`, Uint8Array.of(9, 9, 9, 9, 9));
    await expoFiles.move(`${DIR}/new.tmp`, `${DIR}/new.enc`);
    expect([...(control.get(`${DIR}/new.enc`) ?? [])]).toEqual([1, 2, 3]);
    expect(control.has(`${DIR}/new.tmp`)).toBe(false);
  });
});

describe('sealed audio over the device adapter', () => {
  const SOURCE = 'file:///cache/Audio/take.wav';
  const TARGET = `${DIR}/id-1.enc`;

  async function sealed(length: number) {
    const key = await nodeAes.importKey(await nodeAes.generateKey());
    control.put(SOURCE, sequence(length));
    await sealAudioFile(nodeAes, key, expoFiles, {
      id: 'id-1',
      source: SOURCE,
      target: TARGET,
      frameBytes: 256,
    });
    return key;
  }

  async function opened(key: Awaited<ReturnType<typeof sealed>>) {
    const chunks: Uint8Array[] = [];
    await openSealedAudio(nodeAes, key, expoFiles, 'id-1', TARGET, {
      begin: () => undefined,
      chunk: async (bytes) => {
        chunks.push(bytes);
      },
    });
    return Buffer.concat(chunks);
  }

  it('seals, proves, and opens a take of many frames, however the device chops its reads', async () => {
    for (const maxRead of [Infinity, 100, 1]) {
      control.reset();
      control.maxRead = maxRead;
      const key = await sealed(256 * 9 + 31);
      expect(control.has(`${TARGET}.tmp`)).toBe(false);
      expectBytes(await opened(key), sequence(256 * 9 + 31));
      expectBytes(control.get(SOURCE), sequence(256 * 9 + 31));
      expect(control.open).toBe(0);
    }
  });

  it('refuses a file cut at a frame boundary, and closes everything', async () => {
    const key = await sealed(256 * 4);
    const whole = control.get(TARGET) ?? new Uint8Array(0);
    control.put(TARGET, whole.slice(0, whole.length - (256 + 28)));
    await expect(opened(key)).rejects.toBeInstanceOf(DecryptionError);
    expect(control.open).toBe(0);
  });

  it('leaves no handle open when sealing fails part way', async () => {
    const key = await nodeAes.importKey(await nodeAes.generateKey());
    control.put(SOURCE, sequence(256 * 4));
    const failing = {
      ...expoFiles,
      move: () => Promise.reject(new Error('disk full')),
    };
    await expect(
      sealAudioFile(nodeAes, key, failing, {
        id: 'id-1',
        source: SOURCE,
        target: TARGET,
        frameBytes: 256,
      }),
    ).rejects.toThrow('disk full');
    expect(control.open).toBe(0);
    expect(control.has(`${TARGET}.tmp`)).toBe(false);
    expect(control.has(TARGET)).toBe(false);
    expect(control.has(SOURCE)).toBe(true);
  });
});
