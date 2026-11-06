import { planAdtsPieces, readHeader } from './adts';

const RATE_INDEX = 7; // 22050 Hz, which is what the recorder asks for.

/** One ADTS frame of `length` bytes. `fakes` are sync-like bytes put into the audio on purpose. */
function frame(
  length: number,
  random: () => number,
  options: { crc?: boolean; fakes?: boolean } = {},
) {
  const header = options.crc ? 9 : 7;
  const bytes = new Uint8Array(length);
  for (let i = header; i < length; i += 1) bytes[i] = Math.floor(random() * 256);
  if (options.fakes) {
    // Places that look like a header, with a believable length, but are only audio.
    for (let at = header + 5; at + 7 < length; at += 23 + Math.floor(random() * 30)) {
      bytes.set([0xff, 0xf1, 0x5c, 0x40, 0x1d, 0x80, 0xfc], at);
    }
  }
  bytes[0] = 0xff;
  bytes[1] = options.crc ? 0xf0 : 0xf1;
  bytes[2] = (1 << 6) | (RATE_INDEX << 2);
  bytes[3] = (1 << 6) | ((length >> 11) & 3);
  bytes[4] = (length >> 3) & 0xff;
  bytes[5] = ((length & 7) << 5) | 0x1f;
  bytes[6] = 0xfc;
  return bytes;
}

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** A stream of `count` frames of varying size, and where each one begins. */
function stream(count: number, options: { crc?: boolean; fakes?: boolean; prefix?: number } = {}) {
  const random = rng(7);
  const frames: Uint8Array[] = [];
  const starts: number[] = [];
  let at = options.prefix ?? 0;
  for (let i = 0; i < count; i += 1) {
    const length = 120 + Math.floor(random() * 220);
    frames.push(frame(length, random, options));
    starts.push(at);
    at += length;
  }
  const file = new Uint8Array(at);
  frames.forEach((bytes, i) => file.set(bytes, starts[i]));
  return { file, starts };
}

function reader(file: Uint8Array) {
  const reads: number[] = [];
  return {
    reads,
    read: async (offset: number, length: number) => {
      reads.push(length);
      return file.slice(offset, offset + length);
    },
  };
}

describe('readHeader', () => {
  it('reads the rate, the channels, the length and how much sound a frame holds', () => {
    const header = readHeader(frame(300, rng(1)), 0);
    expect(header).toMatchObject({ length: 300, sampleRate: 22050, channels: 1, samples: 1024 });
  });

  it('reads the longer header that carries a checksum', () => {
    expect(readHeader(frame(300, rng(1), { crc: true }), 0)).toMatchObject({ length: 300 });
  });

  it('refuses what is not a header', () => {
    const good = frame(300, rng(1));
    expect(readHeader(good, 1)).toBeNull();
    expect(readHeader(good.subarray(0, 6), 0)).toBeNull();
    expect(readHeader(new Uint8Array(20), 0)).toBeNull();
    // Layer must be 00.
    expect(
      readHeader(
        Uint8Array.from(good, (b, i) => (i === 1 ? 0xf3 : b)),
        0,
      ),
    ).toBeNull();
    // A sampling-rate index past the table, no channels, a length shorter than the header.
    expect(
      readHeader(
        Uint8Array.from(good, (b, i) => (i === 2 ? b | 0x34 : b)),
        0,
      ),
    ).toBeNull();
    expect(
      readHeader(
        Uint8Array.from(good, (b, i) => (i === 2 ? b & 0xfe : i === 3 ? 0 : b)),
        0,
      ),
    ).toBeNull();
    const short = frame(300, rng(1));
    short[3] = 0x40;
    short[4] = 0;
    short[5] = 0xdf;
    expect(readHeader(short, 0)).toBeNull();
  });
});

describe('planAdtsPieces', () => {
  const FRAME_SECONDS = 1024 / 22050;
  const OVERLAP_FRAMES = Math.ceil(3 / FRAME_SECONDS);
  const limits = (seconds: number, bytes = 4_000_000, overlapSeconds = 3, minSeconds = 0) => ({
    seconds,
    bytes,
    overlapSeconds,
    minSeconds,
  });

  it.each([
    ['plain frames', {}],
    ['frames with a checksum', { crc: true }],
    ['frames full of sync-like bytes in the audio', { fakes: true }],
    ['a file that begins with something that is not audio', { prefix: 100 }],
  ])(
    'cuts %s on frames, in pieces within the limit, overlapping by the time asked',
    async (_, options) => {
      const { file, starts } = stream(3000, options);
      const frames = new Set(starts);
      const plan = await planAdtsPieces(file.length, limits(30), reader(file).read);
      expect(plan).not.toBeNull();
      const { ranges, overlapSeconds } = plan!;
      expect(ranges.length).toBeGreaterThan(3);
      expect(overlapSeconds).toBeCloseTo(OVERLAP_FRAMES * FRAME_SECONDS, 5);
      expect(overlapSeconds).toBeGreaterThanOrEqual(3);
      expect(overlapSeconds).toBeLessThan(3.05);

      expect(ranges[0]!.start).toBe(starts[0]);
      expect(ranges.at(-1)!.end).toBe(file.length);
      const maxFrames = Math.floor(30 / FRAME_SECONDS);
      ranges.forEach((range, index) => {
        // Every piece begins on a real frame, and every piece but the last ends on one.
        expect(frames.has(range.start)).toBe(true);
        if (index < ranges.length - 1) expect(frames.has(range.end)).toBe(true);
        const inside = starts.filter((at) => at >= range.start && at < range.end).length;
        expect(inside).toBeLessThanOrEqual(maxFrames);
        if (index < ranges.length - 1) expect(inside).toBe(maxFrames);
        if (index > 0) {
          const before = ranges[index - 1]!;
          // It begins before the last one ended, by exactly the frames of the overlap.
          const between = starts.filter((at) => at >= range.start && at < before.end).length;
          expect(between).toBe(OVERLAP_FRAMES);
        }
      });
    },
  );

  it('puts every frame of the file in some piece', async () => {
    const { file, starts } = stream(2000, { fakes: true });
    const plan = await planAdtsPieces(file.length, limits(20), reader(file).read);
    for (const at of starts) {
      expect(plan!.ranges.some(({ start, end }) => at >= start && at < end)).toBe(true);
    }
  });

  it('cuts by sound and not by bytes, so a quiet stretch of tiny frames cannot make a piece too long', async () => {
    // The first frames are tiny, as a recorder that saves bits on silence makes them.
    const random = rng(5);
    const frames: Uint8Array[] = [];
    for (let i = 0; i < 6000; i += 1) frames.push(frame(i < 2600 ? 12 : 250, random));
    const file = new Uint8Array(frames.reduce((total, f) => total + f.length, 0));
    let at = 0;
    for (const f of frames) {
      file.set(f, at);
      at += f.length;
    }
    const plan = await planAdtsPieces(file.length, limits(60), reader(file).read);
    const maxFrames = Math.floor(60 / FRAME_SECONDS);
    // A minute holds the same number of frames whatever their size, so the first piece is a few
    // kilobytes, where cutting by a byte count would have made it far longer than a minute.
    expect(plan!.ranges[0]!.end - plan!.ranges[0]!.start).toBe(maxFrames * 12);
    expect(plan!.ranges.length).toBeGreaterThanOrEqual(Math.floor(6000 / maxFrames));
  });

  it('also keeps a piece within the bytes the server takes', async () => {
    const { file } = stream(3000);
    const plan = await planAdtsPieces(file.length, limits(1000, 40_000), reader(file).read);
    for (const { start, end } of plan!.ranges) expect(end - start).toBeLessThanOrEqual(40_000);
    expect(plan!.ranges.length).toBeGreaterThan(2);
  });

  it('reads the file a chunk at a time, never all of it at once', async () => {
    // About 14 MB at the recorder's 40 kbps.
    const count = Math.ceil(14_000_000 / 232);
    const random = rng(3);
    const parts: Uint8Array[] = [];
    let size = 0;
    for (let i = 0; i < count; i += 1) {
      const bytes = frame(200 + Math.floor(random() * 64), random, { fakes: i % 3 === 0 });
      parts.push(bytes);
      size += bytes.length;
    }
    const file = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
      file.set(part, at);
      at += part.length;
    }
    const { read, reads } = reader(file);
    const plan = await planAdtsPieces(file.length, limits(300), read);
    // 300 seconds is about 6,460 frames of about 232 bytes.
    expect(plan!.ranges.length).toBeGreaterThanOrEqual(8);
    expect(plan!.ranges.length).toBeLessThanOrEqual(10);
    expect(Math.max(...reads)).toBeLessThanOrEqual(262_144);
    // The file once over, and a little more for the frames that straddle a chunk.
    expect(reads.reduce((total, length) => total + length, 0)).toBeLessThan(file.length * 1.05);
  });

  it('keeps a half-written last frame in the last piece', async () => {
    const { file } = stream(1000);
    const cutShort = file.subarray(0, file.length - 50);
    const plan = await planAdtsPieces(cutShort.length, limits(20), reader(cutShort).read);
    expect(plan!.ranges.at(-1)!.end).toBe(cutShort.length);
  });

  it('keeps a little junk after the last frame in the last piece', async () => {
    const { file } = stream(1000);
    const padded = new Uint8Array(file.length + 3000);
    padded.set(file);
    const plan = await planAdtsPieces(padded.length, limits(20), reader(padded).read);
    expect(plan!.ranges.at(-1)!.end).toBe(padded.length);
  });

  it('follows the frames over damage short enough to skip', async () => {
    const { file, starts } = stream(3000);
    const damaged = file.slice();
    const random = rng(11);
    for (let i = starts[1000]! + 1; i < starts[1000]! + 400; i += 1) {
      damaged[i] = Math.floor(random() * 256);
    }
    const plan = await planAdtsPieces(damaged.length, limits(30), reader(damaged).read);
    expect(plan).not.toBeNull();
    expect(plan!.ranges.at(-1)!.end).toBe(damaged.length);
  });

  it('gives up, rather than guess, on a file that is not ADTS', async () => {
    const random = rng(9);
    const noise = Uint8Array.from({ length: 200_000 }, () => Math.floor(random() * 256));
    expect(await planAdtsPieces(noise.length, limits(30), reader(noise).read)).toBeNull();
    const mp4 = new Uint8Array(200_000);
    mp4.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(await planAdtsPieces(mp4.length, limits(30), reader(mp4).read)).toBeNull();
  });

  it('gives up when the frames stop making sense for good in the middle of the file', async () => {
    const { file, starts } = stream(3000);
    const spoiled = file.slice();
    const random = rng(11);
    for (let i = starts[1000]!; i < starts[1000]! + 300_000; i += 1) {
      spoiled[i % spoiled.length] = Math.floor(random() * 256);
    }
    expect(await planAdtsPieces(spoiled.length, limits(30), reader(spoiled).read)).toBeNull();
  });

  it('joins an end of the take that is little more than the overlap to the piece before it', async () => {
    const maxFrames = Math.floor(30 / FRAME_SECONDS);
    // Two full pieces, and then 5 seconds of sound after them, which is the overlap and 2 more.
    const count = maxFrames + (maxFrames - OVERLAP_FRAMES) + OVERLAP_FRAMES + 40;
    const { file, starts } = stream(count);
    const bare = await planAdtsPieces(file.length, limits(30), reader(file).read);
    expect(bare!.ranges).toHaveLength(3);
    const folded = await planAdtsPieces(
      file.length,
      limits(30, 4_000_000, 3, 20),
      reader(file).read,
    );
    expect(folded!.ranges).toHaveLength(2);
    // The second piece now runs to the end of the file, from where it began.
    expect(folded!.ranges[1]).toEqual({ start: bare!.ranges[1]!.start, end: file.length });
    const inside = starts.filter((at) => at >= folded!.ranges[1]!.start).length;
    expect(inside).toBe(maxFrames + OVERLAP_FRAMES + 40);
    // And an end of the take that is long enough is a piece of its own.
    const longer = stream(count + 700);
    const own = await planAdtsPieces(
      longer.file.length,
      limits(30, 4_000_000, 3, 20),
      reader(longer.file).read,
    );
    expect(own!.ranges).toHaveLength(3);
  });

  it('does not join an end to a piece when that would be more bytes than a request may carry', async () => {
    const maxFrames = Math.floor(30 / FRAME_SECONDS);
    const { file } = stream(maxFrames + (maxFrames - OVERLAP_FRAMES) + OVERLAP_FRAMES + 40);
    const plan = await planAdtsPieces(file.length, limits(30, 160_000, 3, 20), reader(file).read);
    expect(plan!.ranges.every(({ start, end }) => end - start <= 160_000)).toBe(true);
    expect(plan!.ranges).toHaveLength(3);
  });

  it('is a single piece when the file fits', async () => {
    const { file, starts } = stream(50);
    const plan = await planAdtsPieces(file.length, limits(600), reader(file).read);
    expect(plan!.ranges).toEqual([{ start: starts[0], end: file.length }]);
  });

  it('refuses limits that leave no room past the overlap', async () => {
    const { file } = stream(500);
    expect(await planAdtsPieces(file.length, limits(5), reader(file).read)).toBeNull();
  });
});
