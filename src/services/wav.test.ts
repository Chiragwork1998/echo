import { parseWav, planPieces, quietestCut, wavHeader, wavPiece } from './wav';

const RATE = 24_000;

/** A 24 kHz mono WAV in memory: a steady tone, with the given stretches (in seconds) silent. */
function tone(seconds: number, quiet: [number, number][] = []) {
  const samples = new Int16Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i += 1) {
    const at = i / RATE;
    const silent = quiet.some(([from, to]) => at >= from && at < to);
    samples[i] = silent ? 0 : Math.round(8000 * Math.sin(i / 7));
  }
  const pcm = new Uint8Array(samples.buffer);
  const file = new Uint8Array(44 + pcm.length);
  file.set(wavHeader({ sampleRate: RATE, channels: 1 }, pcm.length));
  file.set(pcm, 44);
  return file;
}
const reader = (file: Uint8Array) => async (offset: number, length: number) =>
  file.slice(offset, offset + length);

describe('parseWav', () => {
  it('reads the format and where the samples are', () => {
    const file = tone(1);
    expect(parseWav(file.subarray(0, 4096), file.length)).toEqual({
      sampleRate: RATE,
      channels: 1,
      bitsPerSample: 16,
      dataOffset: 44,
      dataBytes: RATE * 2,
    });
  });

  it('trusts the file over a header that was left stale by a crash', () => {
    const file = tone(1);
    const stale = file.slice();
    new DataView(stale.buffer).setUint32(40, 0, true);
    expect(parseWav(stale, stale.length)?.dataBytes).toBe(RATE * 2);
    new DataView(stale.buffer).setUint32(40, 0xffffffff, true);
    expect(parseWav(stale, stale.length)?.dataBytes).toBe(RATE * 2);
    // A file cut short is shorter than its header says.
    expect(parseWav(file, 44 + 1001)?.dataBytes).toBe(1000);
  });

  it('refuses what is not 16-bit PCM in a WAV', () => {
    expect(parseWav(new Uint8Array(100), 100)).toBeNull();
    const float = tone(1).slice();
    new DataView(float.buffer).setUint16(20, 3, true);
    expect(parseWav(float, float.length)).toBeNull();
    const eight = tone(1).slice();
    new DataView(eight.buffer).setUint16(34, 8, true);
    expect(parseWav(eight, eight.length)).toBeNull();
  });
});

describe('wavPiece', () => {
  it('makes samples a WAV of their own that reads back the same', () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0]);
    const piece = wavPiece({ sampleRate: RATE, channels: 1 }, pcm);
    expect(piece.length).toBe(44 + 6);
    expect(parseWav(piece, piece.length)).toMatchObject({ dataOffset: 44, dataBytes: 6 });
    expect([...piece.subarray(44)]).toEqual([...pcm]);
  });
});

describe('quietestCut', () => {
  it('cuts in the quietest fifty milliseconds, not in a word', () => {
    const file = tone(4, [[2.5, 2.7]]);
    const window = file.subarray(44);
    const cut = quietestCut(window, { sampleRate: RATE, channels: 1 });
    const seconds = cut / 2 / RATE;
    expect(seconds).toBeGreaterThanOrEqual(2.5);
    expect(seconds).toBeLessThan(2.7);
    expect(cut % 2).toBe(0);
  });
});

describe('planPieces', () => {
  const info = (file: Uint8Array) => parseWav(file.subarray(0, 4096), file.length)!;

  it('is one piece when it already fits', async () => {
    const file = tone(10);
    expect(await planPieces(info(file), 4_000_000, reader(file))).toEqual([
      { start: 44, end: file.length },
    ]);
  });

  it('cuts a long take into pieces that fit, each ending in a quiet moment, covering every sample', async () => {
    // 4.6 MB of audio, with two quiet moments near where a 2 MB limit would fall.
    const file = tone(96, [
      [40.9, 41.0],
      [82.0, 82.1],
    ]);
    const limit = 2_000_000;
    const pieces = await planPieces(info(file), limit, reader(file));
    expect(pieces.length).toBe(3);
    expect(pieces[0]!.start).toBe(44);
    for (const [index, piece] of pieces.entries()) {
      expect(piece.end - piece.start + 44).toBeLessThanOrEqual(limit);
      expect((piece.end - piece.start) % 2).toBe(0);
      if (index > 0) expect(piece.start).toBe(pieces[index - 1]!.end);
    }
    expect(pieces.at(-1)!.end).toBe(file.length);
    const first = (pieces[0]!.end - 44) / 2 / RATE;
    expect(first).toBeGreaterThan(40.9);
    expect(first).toBeLessThan(41.0);
    const second = (pieces[1]!.end - 44) / 2 / RATE;
    expect(second).toBeGreaterThan(82.0);
    expect(second).toBeLessThan(82.1);
  });

  it('always moves forward, even in a take that is one long unbroken sound', async () => {
    const file = tone(60);
    const pieces = await planPieces(info(file), 1_000_000, reader(file));
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.at(-1)!.end).toBe(file.length);
    for (const piece of pieces) expect(piece.end).toBeGreaterThan(piece.start);
  });

  it('plans an hour-long take without holding it in memory, every piece inside the limit', async () => {
    const info = {
      sampleRate: RATE,
      channels: 1,
      bitsPerSample: 16,
      dataOffset: 44,
      dataBytes: RATE * 2 * 3600,
    };
    let largestRead = 0;
    const quietSpot = async (_offset: number, length: number) => {
      largestRead = Math.max(largestRead, length);
      return new Uint8Array(length);
    };
    const pieces = await planPieces(info, 4_000_000, quietSpot);
    expect(pieces.length).toBe(44);
    expect(pieces[0]!.start).toBe(44);
    expect(pieces.at(-1)!.end).toBe(44 + RATE * 2 * 3600);
    pieces.forEach((piece, index) => {
      expect(piece.end - piece.start + 44).toBeLessThanOrEqual(4_000_000);
      if (index > 0) expect(piece.start).toBe(pieces[index - 1]!.end);
    });
    // Only the last few seconds before each cut are ever read to find it.
    expect(largestRead).toBeLessThanOrEqual(8 * RATE * 2);
  });
});
