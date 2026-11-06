import { bytesEqual } from './bytes';
import {
  DecryptionError,
  ENVELOPE_VERSION,
  FRAMED_VERSION,
  frameAdditionalData,
  seal,
} from './envelope';
import { AES_OVERHEAD_BYTES, type AesKey, type AesPort } from './ports';
import {
  FRAME_BYTES,
  HEADER_BYTES,
  layoutOf,
  MAX_FRAME_BYTES,
  openSealedAudio,
  sealAudioFile,
  SealError,
} from './sealedAudio';
import { expectBytes } from './testing/expectBytes';
import { createMemoryFiles, Killed, type MemoryFiles } from './testing/memoryFiles';
import { nodeAes } from './testing/nodePorts';

const ID = 'audio-id-1';
const OTHER_ID = 'audio-id-2';
const SOURCE = '/cache/Audio/take.wav';
const TARGET = '/documents/echo/audio/audio-id-1.enc';
const SECRET = 'a spoken confession nobody was meant to hear';

/** Bytes that differ everywhere, so that a frame moved to the wrong place cannot match by luck. */
function take(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[index] = state >>> 16;
  }
  return out;
}

const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

type Rig = { files: MemoryFiles; key: AesKey; aes: AesPort };

async function rig(aes: AesPort = nodeAes): Promise<Rig> {
  return {
    files: createMemoryFiles(),
    key: await nodeAes.importKey(await nodeAes.generateKey()),
    aes,
  };
}

async function sealTake(
  { files, key, aes }: Rig,
  plain: Uint8Array,
  frameBytes: number,
  id = ID,
  target = TARGET,
): Promise<Uint8Array> {
  files.put(SOURCE, plain);
  await sealAudioFile(aes, key, files, { id, source: SOURCE, target, frameBytes });
  return files.get(target) ?? new Uint8Array(0);
}

async function openAll({ files, key, aes }: Rig, uri = TARGET, id = ID): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let announced = -1;
  await openSealedAudio(aes, key, files, id, uri, {
    begin: (total) => {
      announced = total;
    },
    chunk: async (bytes) => {
      chunks.push(bytes);
    },
  });
  const out = join(...chunks);
  expect(out.length).toBe(announced);
  return out;
}

/** Where every frame of a sealed file starts and ends, header excluded. */
function framesOf(sealed: Uint8Array, frameBytes: number): { start: number; end: number }[] {
  const full = frameBytes + AES_OVERHEAD_BYTES;
  const out: { start: number; end: number }[] = [];
  for (let start = HEADER_BYTES; start < sealed.length; start += full) {
    out.push({ start, end: Math.min(start + full, sealed.length) });
  }
  return out;
}

async function expectRejected(context: Rig, sealed: Uint8Array, id = ID) {
  context.files.put(TARGET, sealed);
  await expect(openAll(context, TARGET, id)).rejects.toBeInstanceOf(DecryptionError);
}

describe('the framed format', () => {
  it('round trips a take of many frames', async () => {
    const context = await rig();
    const plain = take(10 * 1024 + 377);
    const sealed = await sealTake(context, plain, 1024);
    expectBytes(await openAll(context), plain);
    // 11 frames: ten full and a last of 377.
    expect(sealed.length).toBe(HEADER_BYTES + plain.length + 11 * AES_OVERHEAD_BYTES);
  });

  it.each([
    ['one byte', 1],
    ['less than a frame', 700],
    ['exactly one frame', 1024],
    ['one byte over a frame', 1025],
    ['an exact multiple of the frame', 4 * 1024],
    ['a multiple and one byte', 4 * 1024 + 1],
  ])('round trips %s', async (_name, length) => {
    const context = await rig();
    const plain = take(length);
    await sealTake(context, plain, 1024);
    expectBytes(await openAll(context), plain);
  });

  it('seals at the production frame size, and writes the header it documents', async () => {
    const context = await rig();
    const plain = take(2 * FRAME_BYTES + 12345);
    const sealed = await sealTake(context, plain, FRAME_BYTES);
    expect([...sealed.slice(0, HEADER_BYTES)]).toEqual([2, 0x00, 0x40, 0x00, 0x00]);
    expect(framesOf(sealed, FRAME_BYTES)).toHaveLength(3);
    expectBytes(await openAll(context), plain);
  });

  it('keeps the frame size to about 4 MB, and the most a header may ask for well under 32', () => {
    expect(FRAME_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_FRAME_BYTES).toBeGreaterThanOrEqual(FRAME_BYTES);
    expect(MAX_FRAME_BYTES).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  it('does not contain the plaintext, and leaves the source and no pending file behind', async () => {
    const context = await rig();
    const plain = join(Buffer.from(SECRET), take(5000));
    const sealed = await sealTake(context, plain, 1024);
    expect(Buffer.from(sealed).includes(SECRET)).toBe(false);
    expectBytes(context.files.get(SOURCE), plain);
    expect(context.files.has(`${TARGET}.tmp`)).toBe(false);
  });

  it('refuses an empty recording and leaves nothing', async () => {
    const context = await rig();
    context.files.put(SOURCE, new Uint8Array(0));
    await expect(
      sealAudioFile(context.aes, context.key, context.files, {
        id: ID,
        source: SOURCE,
        target: TARGET,
      }),
    ).rejects.toBeInstanceOf(SealError);
    expect(context.files.has(TARGET)).toBe(false);
    expect(context.files.has(`${TARGET}.tmp`)).toBe(false);
    expect(context.files.stats.openReaders + context.files.stats.openWriters).toBe(0);
  });

  it('cannot be opened with another key, or as another recording', async () => {
    const context = await rig();
    await sealTake(context, take(3000), 1024);
    const other = await nodeAes.importKey(await nodeAes.generateKey());
    await expect(openAll({ ...context, key: other })).rejects.toBeInstanceOf(DecryptionError);
    await expect(openAll(context, TARGET, OTHER_ID)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('never quotes content or a path in an error', async () => {
    const context = await rig();
    const sealed = await sealTake(context, Buffer.from(SECRET.repeat(100)), 1024);
    context.files.put(TARGET, sealed.slice(0, sealed.length - 1));
    const error = (await openAll(context).catch((reason: unknown) => reason)) as Error;
    expect(error).toBeInstanceOf(DecryptionError);
    expect(error.message).toBe('decryption failed');
    expect(String(error.stack)).not.toContain(SECRET);
    expect(String(error.stack)).not.toContain(TARGET);
  });
});

describe('the layout', () => {
  const header = (frameBytes: number, version = FRAMED_VERSION) => {
    const out = new Uint8Array(HEADER_BYTES);
    out[0] = version;
    new DataView(out.buffer).setUint32(1, frameBytes);
    return out;
  };

  it('is worked out from the header and the length alone', () => {
    // 3 frames of 100 and a last of 40: 5 + 3 * 128 + 68 bytes.
    expect(layoutOf(header(100), HEADER_BYTES + 3 * 128 + 68)).toEqual({
      frameBytes: 100,
      frames: 4,
      plaintextBytes: 340,
    });
    expect(layoutOf(header(100), HEADER_BYTES + 128)).toEqual({
      frameBytes: 100,
      frames: 1,
      plaintextBytes: 100,
    });
  });

  it('refuses sizes nobody writes, and files with no room for a frame', () => {
    expect(layoutOf(header(0), 1000)).toBeNull();
    expect(layoutOf(header(MAX_FRAME_BYTES + 1), 1000)).toBeNull();
    expect(layoutOf(header(MAX_FRAME_BYTES), HEADER_BYTES + 29)).not.toBeNull();
    expect(layoutOf(header(100, 1), 1000)).toBeNull();
    expect(layoutOf(header(100), HEADER_BYTES)).toBeNull();
    expect(layoutOf(header(100), HEADER_BYTES + AES_OVERHEAD_BYTES)).toBeNull();
    expect(layoutOf(header(100), 3)).toBeNull();
  });

  it('will not seal at a size it would refuse to open', async () => {
    const context = await rig();
    context.files.put(SOURCE, take(500));
    for (const frameBytes of [0, -1, 1.5, MAX_FRAME_BYTES + 1, Number.NaN]) {
      await expect(
        sealAudioFile(context.aes, context.key, context.files, {
          id: ID,
          source: SOURCE,
          target: TARGET,
          frameBytes,
        }),
      ).rejects.toBeInstanceOf(SealError);
    }
    expect(context.files.has(TARGET)).toBe(false);
    expect(context.files.has(`${TARGET}.tmp`)).toBe(false);
  });
});

describe('nonces', () => {
  it('draws a fresh one for every frame, across frames, files, and repeated seals', async () => {
    const context = await rig();
    const plain = take(2000 * 16);
    const nonces = new Set<string>();
    let frames = 0;
    for (const target of [TARGET, `${TARGET}.again`]) {
      // The same plaintext under the same id twice: only the nonce can make the frames differ.
      const sealed = await sealTake(context, plain, 16, ID, target);
      for (const { start } of framesOf(sealed, 16)) {
        nonces.add(Buffer.from(sealed.slice(start, start + 12)).toString('hex'));
        frames += 1;
      }
    }
    expect(frames).toBe(4000);
    expect(nonces.size).toBe(frames);
  });

  it('seals each frame in a call of its own, never two frames under one call', async () => {
    const calls: { plain: number; aad: string }[] = [];
    const watching: AesPort = {
      ...nodeAes,
      encrypt: (key, plaintext, aad) => {
        calls.push({ plain: plaintext.length, aad: Buffer.from(aad).toString('hex') });
        return nodeAes.encrypt(key, plaintext, aad);
      },
    };
    const context = await rig(watching);
    await sealTake(context, take(5 * 1024 + 9), 1024);
    expect(calls.map((call) => call.plain)).toEqual([1024, 1024, 1024, 1024, 1024, 9]);
    // Every call has its own AAD, so the port never sees the same (key, AAD) twice either.
    expect(new Set(calls.map((call) => call.aad)).size).toBe(6);
  });
});

describe('what each frame is bound to', () => {
  it('puts the id, the kind, the version, the frame size, the index, and the last flag in the AAD', () => {
    const base = frameAdditionalData('audio', ID, 1024, 3, false);
    const differs = (other: Uint8Array) => !bytesEqual(base, other);
    expect(differs(frameAdditionalData('audio', OTHER_ID, 1024, 3, false))).toBe(true);
    expect(differs(frameAdditionalData('entry', ID, 1024, 3, false))).toBe(true);
    expect(differs(frameAdditionalData('audio', ID, 2048, 3, false))).toBe(true);
    expect(differs(frameAdditionalData('audio', ID, 1024, 4, false))).toBe(true);
    expect(differs(frameAdditionalData('audio', ID, 1024, 3, true))).toBe(true);
    expect(Buffer.from(base).toString('latin1')).toContain(`echo/v${FRAMED_VERSION}`);
    expect(FRAMED_VERSION).not.toBe(ENVELOPE_VERSION);
  });

  it('does not open a framed file as a single envelope', async () => {
    const context = await rig();
    const sealed = await sealTake(context, take(500), 1024);
    const asOldEnvelope = sealed.slice();
    asOldEnvelope[0] = ENVELOPE_VERSION;
    await expectRejected(context, asOldEnvelope);
  });
});

describe('tampering', () => {
  const FRAME = 256;
  const LENGTH = 3 * FRAME + 100; // three full frames and a short last one

  async function sealed() {
    const context = await rig();
    const bytes = await sealTake(context, take(LENGTH), FRAME);
    const frames = framesOf(bytes, FRAME);
    const header = bytes.slice(0, HEADER_BYTES);
    const frame = (index: number) => bytes.slice(frames[index]?.start, frames[index]?.end);
    return { context, bytes, frames, header, frame };
  }

  it('rejects a flipped bit anywhere in the file', async () => {
    const { context, bytes } = await sealed();
    for (let index = 0; index < bytes.length; index += 1) {
      const tampered = bytes.slice();
      tampered[index] = (tampered[index] ?? 0) ^ 0x01;
      await expectRejected(context, tampered);
    }
  });

  it('rejects a file cut short at any length, and at every frame boundary', async () => {
    const { context, bytes, frames } = await sealed();
    for (let length = 0; length < bytes.length; length += 1) {
      await expectRejected(context, bytes.slice(0, length));
    }
    for (const { start } of frames) await expectRejected(context, bytes.slice(0, start));
  });

  it('rejects bytes added at the end', async () => {
    const { context, bytes } = await sealed();
    await expectRejected(context, join(bytes, new Uint8Array(1)));
    await expectRejected(context, join(bytes, take(40)));
    await expectRejected(context, join(bytes, take(FRAME + AES_OVERHEAD_BYTES)));
  });

  it('rejects a file with a frame dropped from the middle or the front', async () => {
    const { context, header, frame } = await sealed();
    await expectRejected(context, join(header, frame(0), frame(2), frame(3)));
    await expectRejected(context, join(header, frame(1), frame(2), frame(3)));
    await expectRejected(context, join(header, frame(0), frame(1), frame(3)));
  });

  it('rejects frames swapped, including the last with an earlier one', async () => {
    const { context, header, frame } = await sealed();
    await expectRejected(context, join(header, frame(1), frame(0), frame(2), frame(3)));
    await expectRejected(context, join(header, frame(0), frame(2), frame(1), frame(3)));
    await expectRejected(context, join(header, frame(0), frame(1), frame(3), frame(2)));
  });

  it('rejects a frame repeated, in place of another or added', async () => {
    const { context, header, frame } = await sealed();
    await expectRejected(context, join(header, frame(0), frame(0), frame(2), frame(3)));
    await expectRejected(context, join(header, frame(0), frame(1), frame(1), frame(2), frame(3)));
    await expectRejected(context, join(header, frame(0), frame(1), frame(2), frame(3), frame(1)));
  });

  it('rejects the last frame stood in for by an earlier full one', async () => {
    const { context, header, frame } = await sealed();
    await expectRejected(context, join(header, frame(0), frame(1), frame(2), frame(2)));
  });

  it('rejects a frame moved in from another file, even to the same place', async () => {
    const { context, bytes, frames } = await sealed();
    const other = await sealTake(context, take(LENGTH, 99), FRAME, OTHER_ID, '/other.enc');
    const otherFrames = framesOf(other, FRAME);
    for (let index = 0; index < frames.length; index += 1) {
      const at = frames[index];
      const from = otherFrames[index];
      if (!at || !from) throw new Error('layout');
      await expectRejected(
        context,
        join(bytes.slice(0, at.start), other.slice(from.start, from.end), bytes.slice(at.end)),
      );
    }
  });

  it('rejects a whole file put under another recording', async () => {
    const { context, bytes } = await sealed();
    context.files.put(TARGET, bytes);
    await expect(openAll(context, TARGET, OTHER_ID)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects a changed frame size even when the file still divides the same way', async () => {
    const context = await rig();
    const bytes = await sealTake(context, take(100), 256); // one frame, so any size >= 100 divides
    const tampered = bytes.slice();
    new DataView(tampered.buffer).setUint32(1, 512);
    expect(layoutOf(tampered.slice(0, HEADER_BYTES), tampered.length)).not.toBeNull();
    await expectRejected(context, tampered);
  });

  it('refuses a header that asks for an enormous frame without reading a frame', async () => {
    const { context, bytes } = await sealed();
    const tampered = bytes.slice();
    new DataView(tampered.buffer).setUint32(1, 0xffffffff);
    context.files.put(TARGET, tampered);
    context.files.revive();
    await expect(openAll(context)).rejects.toBeInstanceOf(DecryptionError);
    expect(context.files.stats.largestRead).toBeLessThanOrEqual(HEADER_BYTES);
  });

  it('rejects files that are not framed audio at all', async () => {
    const context = await rig();
    for (const junk of [
      new Uint8Array(0),
      Uint8Array.of(2),
      Uint8Array.of(2, 0, 0, 4, 0),
      Uint8Array.of(0, 0, 0, 0, 0, 0),
      Uint8Array.of(3, 0, 0, 4, 0, ...take(100)),
      take(5000),
    ]) {
      await expectRejected(context, junk);
    }
  });

  it('rejects a last frame with nothing in it, which no sealing writes', async () => {
    const context = await rig();
    const bytes = await sealTake(context, take(2 * 128), 128);
    expect(layoutOf(bytes.slice(0, HEADER_BYTES), bytes.length)).toMatchObject({ frames: 2 });
    const padded = join(bytes, new Uint8Array(AES_OVERHEAD_BYTES));
    expect(layoutOf(padded.slice(0, HEADER_BYTES), padded.length)).toBeNull();
    await expectRejected(context, padded);
  });

  it('leaves no handle open after a failure', async () => {
    const { context, bytes } = await sealed();
    await expectRejected(context, bytes.slice(0, bytes.length - 1));
    expect(context.files.stats.openReaders).toBe(0);
  });
});

describe('the earlier format', () => {
  async function legacy(context: Rig, plain: Uint8Array) {
    // Exactly what sealRecording wrote before audio was framed: seal() of the whole recording.
    const envelope = await seal(context.aes, context.key, 'audio', ID, plain);
    context.files.put(TARGET, envelope);
    return envelope;
  }

  it('still opens, whole, and is not rewritten', async () => {
    const context = await rig();
    const plain = take(300_000);
    const envelope = await legacy(context, plain);
    expect(envelope[0]).toBe(ENVELOPE_VERSION);
    expectBytes(await openAll(context), plain);
    expect(context.files.get(TARGET)).toEqual(envelope);
    expect(context.files.stats.bytesWritten).toBe(0);
  });

  it('still fails when altered, truncated, or put under another recording', async () => {
    const context = await rig();
    const envelope = await legacy(context, take(2000));
    const flipped = envelope.slice();
    flipped[100] = (flipped[100] ?? 0) ^ 1;
    await expectRejected(context, flipped);
    await expectRejected(context, envelope.slice(0, envelope.length - 1));
    context.files.put(TARGET, envelope);
    await expect(openAll(context, TARGET, OTHER_ID)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('opens a file the earlier code wrote, byte for byte (recorded vector)', async () => {
    // Made by the code before framing, with a key made for this vector. If this stops opening, every
    // recording already on a user's phone has been lost.
    const key = await nodeAes.importKey(VECTOR_KEY);
    const context: Rig = { files: createMemoryFiles(), key, aes: nodeAes };
    context.files.put(TARGET, Buffer.from(LEGACY_ENVELOPE_HEX, 'hex'));
    expect(Buffer.from(await openAll(context, TARGET, VECTOR_ID)).toString()).toBe(VECTOR_TEXT);
  });
});

describe('the framed format, recorded', () => {
  it('opens a file made by this code, byte for byte (recorded vector)', async () => {
    // If the layout or the AAD ever changes, this fails, and the format version must change with it.
    const key = await nodeAes.importKey(VECTOR_KEY);
    const context: Rig = { files: createMemoryFiles(), key, aes: nodeAes };
    context.files.put(TARGET, Buffer.from(FRAMED_FILE_HEX, 'hex'));
    expect(Buffer.from(await openAll(context, TARGET, VECTOR_ID)).toString()).toBe(VECTOR_TEXT);
    expect(Buffer.from(FRAMED_FILE_HEX, 'hex')[0]).toBe(FRAMED_VERSION);
  });
});

describe('sealing is safe to interrupt', () => {
  const FRAME = 200;
  const plain = take(3 * FRAME + 50);

  /** How many port calls a sealing makes when nothing stops it. */
  async function callsInCleanSeal() {
    const context = await rig();
    context.files.put(SOURCE, plain);
    const before = context.files.stats.trace.length;
    await sealAudioFile(context.aes, context.key, context.files, {
      id: ID,
      source: SOURCE,
      target: TARGET,
      frameBytes: FRAME,
    });
    return context.files.stats.trace.length - before;
  }

  it.each([false, true])(
    'at every call it makes, the target is absent or whole, and the plaintext is untouched (torn writes: %s)',
    async (tearWrite) => {
      const calls = await callsInCleanSeal();
      expect(calls).toBeGreaterThan(20);
      for (let at = 1; at <= calls + 1; at += 1) {
        const context = await rig();
        context.files.put(SOURCE, plain);
        context.files.killAt(at, { tearWrite });
        const outcome = await sealAudioFile(context.aes, context.key, context.files, {
          id: ID,
          source: SOURCE,
          target: TARGET,
          frameBytes: FRAME,
        }).then(
          () => 'sealed',
          (error: unknown) => (error instanceof Killed ? 'killed' : 'failed'),
        );
        expect(outcome).toBe(at <= calls ? 'killed' : 'sealed');

        // The process is gone. What is on disk is what the next launch finds.
        context.files.revive();
        expectBytes(context.files.get(SOURCE), plain);
        const sealedFile = context.files.get(TARGET);
        if (sealedFile) {
          // The name the database will point at exists only for a file that was proved first.
          expectBytes(await openAll(context), plain);
        }
        // Whatever else is left is under the pending name, which nothing mistakes for a recording.
        for (const { name } of context.files.list('/documents/echo/audio')) {
          expect(['audio-id-1.enc', 'audio-id-1.enc.tmp']).toContain(name);
        }
        if (outcome === 'sealed') expect(context.files.has(`${TARGET}.tmp`)).toBe(false);
      }
    },
  );

  it('removes the pending file and keeps the plaintext when the disk fails part way', async () => {
    const context = await rig();
    context.files.put(SOURCE, plain);
    const real = context.files.openWriter.bind(context.files);
    let writes = 0;
    context.files.openWriter = (uri) => {
      const writer = real(uri);
      return {
        close: writer.close,
        write: async (bytes) => {
          writes += 1;
          if (writes === 3) throw new Error('disk full');
          await writer.write(bytes);
        },
      };
    };
    await expect(
      sealAudioFile(context.aes, context.key, context.files, {
        id: ID,
        source: SOURCE,
        target: TARGET,
        frameBytes: FRAME,
      }),
    ).rejects.toThrow('disk full');
    expect(context.files.has(TARGET)).toBe(false);
    expect(context.files.has(`${TARGET}.tmp`)).toBe(false);
    expectBytes(context.files.get(SOURCE), plain);
    expect(context.files.stats.openReaders + context.files.stats.openWriters).toBe(0);
  });

  it('does not let a file that was written wrong become the target', async () => {
    // Ciphertext that reads back different from what was sealed: a bit lost on the way to the disk.
    const context = await rig();
    context.files.put(SOURCE, plain);
    const real = context.files.openWriter.bind(context.files);
    context.files.openWriter = (uri) => {
      const writer = real(uri);
      let writes = 0;
      return {
        close: writer.close,
        write: async (bytes) => {
          writes += 1;
          const written = bytes.slice();
          if (writes === 3) written[10] = (written[10] ?? 0) ^ 1;
          await writer.write(written);
        },
      };
    };
    await expect(
      sealAudioFile(context.aes, context.key, context.files, {
        id: ID,
        source: SOURCE,
        target: TARGET,
        frameBytes: FRAME,
      }),
    ).rejects.toBeInstanceOf(SealError);
    expect(context.files.has(TARGET)).toBe(false);
    expect(context.files.has(`${TARGET}.tmp`)).toBe(false);
    expectBytes(context.files.get(SOURCE), plain);
  });

  it('does not accept ciphertext that opens to something other than the plaintext', async () => {
    // A port that seals the right size of the wrong bytes, as a faulty native layer might.
    const wrong: AesPort = {
      ...nodeAes,
      encrypt: (key, plaintext, aad) => nodeAes.encrypt(key, take(plaintext.length, 7), aad),
    };
    const context = await rig(wrong);
    context.files.put(SOURCE, plain);
    await expect(
      sealAudioFile(wrong, context.key, context.files, {
        id: ID,
        source: SOURCE,
        target: TARGET,
        frameBytes: FRAME,
      }),
    ).rejects.toBeInstanceOf(SealError);
    expect(context.files.has(TARGET)).toBe(false);
    expect(context.files.has(`${TARGET}.tmp`)).toBe(false);
  });
});

describe('memory', () => {
  const FRAME = 4096;

  /** Seals, proves, and opens a take of this many frames, and reports the largest of anything held. */
  async function measure(frames: number) {
    let plainest = 0;
    let sealedest = 0;
    const counting: AesPort = {
      ...nodeAes,
      encrypt: (key, plaintext, aad) => {
        plainest = Math.max(plainest, plaintext.length);
        return nodeAes.encrypt(key, plaintext, aad);
      },
      decrypt: (key, sealed, aad) => {
        sealedest = Math.max(sealedest, sealed.length);
        return nodeAes.decrypt(key, sealed, aad);
      },
    };
    const context = await rig(counting);
    const plain = take(frames * FRAME - 17);
    await sealTake(context, plain, FRAME);
    let chunkest = 0;
    let total = 0;
    await openSealedAudio(counting, context.key, context.files, ID, TARGET, {
      begin: () => undefined,
      chunk: async (bytes) => {
        chunkest = Math.max(chunkest, bytes.length);
        total += bytes.length;
      },
    });
    expect(total).toBe(plain.length);
    const { stats } = context.files;
    return {
      largestRead: stats.largestRead,
      largestWrite: stats.largestWrite,
      wholeReads: stats.wholeReads,
      handles: stats.openReaders + stats.openWriters,
      plainest,
      sealedest,
      chunkest,
      bytesMoved: stats.bytesRead + stats.bytesWritten,
    };
  }

  it('never holds more than a frame at once, however long the take', async () => {
    const small = await measure(2);
    const long = await measure(64);
    const longer = await measure(1000);

    for (const peak of [small, long, longer]) {
      expect(peak.largestRead).toBeLessThanOrEqual(FRAME + AES_OVERHEAD_BYTES);
      expect(peak.largestWrite).toBeLessThanOrEqual(FRAME + AES_OVERHEAD_BYTES);
      expect(peak.plainest).toBeLessThanOrEqual(FRAME);
      expect(peak.sealedest).toBeLessThanOrEqual(FRAME + AES_OVERHEAD_BYTES);
      expect(peak.chunkest).toBeLessThanOrEqual(FRAME);
      expect(peak.wholeReads).toBe(0);
      expect(peak.handles).toBe(0);
    }
    // The bound does not move as the file grows five hundredfold, while the work does.
    for (const key of [
      'largestRead',
      'largestWrite',
      'plainest',
      'sealedest',
      'chunkest',
    ] as const) {
      expect(long[key]).toBe(small[key]);
      expect(longer[key]).toBe(small[key]);
    }
    expect(longer.bytesMoved).toBeGreaterThan(300 * small.bytesMoved);
  });

  it('holds one frame at the production size too', async () => {
    // Twelve frames of 4 MiB, 48 MB, each range of the source made up as it is asked for.
    const frames = 12;
    const total = frames * FRAME_BYTES - 123;
    const files = createMemoryFiles();
    const real = files.openReader.bind(files);
    files.openReader = (uri) => {
      if (uri !== SOURCE) return real(uri);
      return {
        size: total,
        read: async (offset, length) => {
          const out = new Uint8Array(Math.max(0, Math.min(length, total - offset)));
          for (let index = 0; index < out.length; index += 1) out[index] = (offset + index) % 251;
          return out;
        },
        close: () => undefined,
      };
    };
    let plainest = 0;
    const counting: AesPort = {
      ...nodeAes,
      encrypt: (key, plaintext, aad) => {
        plainest = Math.max(plainest, plaintext.length);
        return nodeAes.encrypt(key, plaintext, aad);
      },
    };
    const key = await nodeAes.importKey(await nodeAes.generateKey());

    await sealAudioFile(counting, key, files, { id: ID, source: SOURCE, target: TARGET });

    expect(files.size(TARGET)).toBe(HEADER_BYTES + total + frames * AES_OVERHEAD_BYTES);
    expect(plainest).toBe(FRAME_BYTES);
    expect(files.stats.largestWrite).toBe(FRAME_BYTES + AES_OVERHEAD_BYTES);
    expect(files.stats.largestRead).toBe(FRAME_BYTES + AES_OVERHEAD_BYTES);
    expect(files.stats.wholeReads).toBe(0);
    let opened = 0;
    await openSealedAudio(counting, key, files, ID, TARGET, {
      begin: () => undefined,
      chunk: async (bytes) => {
        opened += bytes.length;
      },
    });
    expect(opened).toBe(total);
  }, 60_000);
});

// A key and a recording made only for these vectors.
const VECTOR_KEY = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index)).toString(
  'base64',
);
const VECTOR_ID = 'vector-recording';
const VECTOR_TEXT = 'a recording sealed so that its format stays put';
const LEGACY_ENVELOPE_HEX =
  '0190ff218dfd18b2a49734a573404857ced42a954e8c9bec8ef8e1f753d13446c7068404f684c7ea4c4750903b6935b4ff20a431e11cd9e0d88106ecaac5900073a257cf487c4ead2b7c1f3d';
const FRAMED_FILE_HEX =
  '0200000010548bfd16750762f38e05acfb69aa69ee23401d7e264eef3ee125d3e17ac36bfd602b6b34d47f310958bc9e3a9a7fb5b5aa43fc936680f2cf36ba38e6aac5a7861d2d73879c2a24fc0c91f156d74c552dba07efd632b3585d351a31e615389b969183811cf12ddfc6c2f6b356137978932ec40575a19a0d04b3b9fce7f6d0bd5c1ed8f7';
