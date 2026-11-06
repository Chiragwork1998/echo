// Sealed audio, in frames. A live take is a 24 kHz WAV, about 2.9 MB a minute, so a one-hour take is
// 175 MB: sealing it as one AES-GCM object would hold it in memory three or four times over. A phone
// that kills the app for that does it right after someone has said the most. So audio is cut into
// frames of about 4 MB, each its own AES-256-GCM object, and nothing here ever holds more than a few
// frames: not when sealing, not when checking what was sealed, not when opening it again.
//
//   offset  size  field
//   0       1     format version: 2. The earlier format, one envelope for the whole file, starts with 1
//   1       4     frame size in bytes, big endian: how much plaintext every frame but the last holds
//   5       ...   frame 0, frame 1, ... in order. Each is nonce (12) + ciphertext + tag (16), so
//                 28 bytes longer than its plaintext. Every frame but the last holds exactly the
//                 frame size. The last holds 1 to frame-size bytes. There is no empty frame.
//
// Nothing else is stored. The number of frames and the plaintext length come from the file's length.
//
// What each frame's AAD binds (see frameAdditionalData): the kind and the audio id, which is the
// file's identity; the format version; the frame size; the frame's index; and whether it is the last.
// So a frame cannot be moved to another file, reordered, repeated, or dropped from the middle, and a
// file cut short at a frame boundary ends in a frame that was not sealed as the last one. Every
// frame draws a fresh random 96-bit nonce from the AES port, so no two frames of any file share one.
// The frame size is in the header, which no tag covers by itself, so it is in every AAD as well: a
// changed header fails the first frame. A header that asks for frames over MAX_FRAME_BYTES is refused
// before anything is read, because the size is not yet authenticated at that point.
//
// Files sealed in the earlier format still open, through open() in envelope.ts, and are never
// rewritten. They are the one place a whole file is read at once, because a single GCM object cannot
// be checked in pieces.
import { bytesEqual, tight } from './bytes';
import {
  DecryptionError,
  ENVELOPE_VERSION,
  FRAMED_VERSION,
  frameAdditionalData,
  open,
  type ObjectKind,
} from './envelope';
import {
  AES_OVERHEAD_BYTES,
  type AesKey,
  type AesPort,
  type FilePort,
  type FileWriter,
} from './ports';

const KIND: ObjectKind = 'audio';

/** Plaintext in each frame: about 4 MB. Large enough that native calls are not the cost. */
export const FRAME_BYTES = 4 * 1024 * 1024;
/** The most a header may ask for. Far above FRAME_BYTES, far below anything that could hurt. */
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;
export const HEADER_BYTES = 5;

/** Carries nothing from the audio or the file: errors can reach logs and crash reports. */
export class SealError extends Error {
  constructor() {
    super('audio could not be sealed');
    this.name = 'SealError';
  }
}

export type Layout = {
  frameBytes: number;
  frames: number;
  plaintextBytes: number;
};

/**
 * Reads a framed file's layout from its first bytes and its length. null if the bytes are not a
 * whole framed file: another version, a size nobody writes, no frames, or a last frame with nothing
 * in it.
 */
export function layoutOf(head: Uint8Array, fileBytes: number): Layout | null {
  if (head.length < HEADER_BYTES || head[0] !== FRAMED_VERSION) return null;
  const frameBytes = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(1);
  if (frameBytes < 1 || frameBytes > MAX_FRAME_BYTES) return null;
  const body = fileBytes - HEADER_BYTES;
  const sealedFrame = frameBytes + AES_OVERHEAD_BYTES;
  const frames = Math.ceil(body / sealedFrame);
  if (!(frames >= 1)) return null;
  const lastSealed = body - (frames - 1) * sealedFrame;
  if (lastSealed <= AES_OVERHEAD_BYTES) return null;
  return { frameBytes, frames, plaintextBytes: body - frames * AES_OVERHEAD_BYTES };
}

function quietly(task: () => void): void {
  try {
    task();
  } catch {
    // Nothing more can be done here. The launch sweep removes what a failed clean-up leaves.
  }
}

type SealParams = { id: string; source: string; target: string; frameBytes?: number };

/** Writes `target` from `source`, a frame at a time. Returns how many plaintext bytes it sealed. */
async function writeFrames(
  aes: AesPort,
  key: AesKey,
  files: FilePort,
  { id, source, target, frameBytes = FRAME_BYTES }: SealParams,
): Promise<number> {
  // A size this module would refuse to open is a file nobody could ever read back.
  if (!Number.isInteger(frameBytes) || frameBytes < 1 || frameBytes > MAX_FRAME_BYTES) {
    throw new SealError();
  }
  const reader = files.openReader(source);
  let writer: FileWriter | null = null;
  try {
    const total = reader.size;
    if (total === 0) throw new SealError();
    writer = files.openWriter(target);
    const header = new Uint8Array(HEADER_BYTES);
    header[0] = FRAMED_VERSION;
    new DataView(header.buffer).setUint32(1, frameBytes);
    await writer.write(header);

    const frames = Math.ceil(total / frameBytes);
    for (let index = 0; index < frames; index += 1) {
      const start = index * frameBytes;
      const length = Math.min(frameBytes, total - start);
      const plain = await reader.read(start, length);
      if (plain.length !== length) throw new SealError();
      const aad = frameAdditionalData(KIND, id, frameBytes, index, index === frames - 1);
      await writer.write(await aes.encrypt(key, tight(plain), aad));
    }
    writer.close();
    return total;
  } finally {
    if (writer) quietly(() => writer?.close());
    quietly(() => reader.close());
  }
}

/** Opens a framed file's frames in order, handing each one's plaintext on. */
async function readFrames(
  aes: AesPort,
  key: AesKey,
  files: FilePort,
  id: string,
  uri: string,
  sink: PlainSink,
): Promise<void> {
  const reader = files.openReader(uri);
  try {
    const layout = layoutOf(await reader.read(0, HEADER_BYTES), reader.size);
    if (!layout) throw new DecryptionError();
    await sink.begin(layout.plaintextBytes);
    const sealedFrame = layout.frameBytes + AES_OVERHEAD_BYTES;
    for (let index = 0; index < layout.frames; index += 1) {
      const last = index === layout.frames - 1;
      const start = HEADER_BYTES + index * sealedFrame;
      const length = last ? reader.size - start : sealedFrame;
      const sealed = await reader.read(start, length);
      if (sealed.length !== length) throw new DecryptionError();
      const aad = frameAdditionalData(KIND, id, layout.frameBytes, index, last);
      let plain: Uint8Array;
      try {
        plain = await aes.decrypt(key, tight(sealed), aad);
      } catch {
        // A bad tag and a native fault look the same from here: it did not open.
        throw new DecryptionError();
      }
      if (plain.length !== length - AES_OVERHEAD_BYTES) throw new DecryptionError();
      await sink.chunk(plain);
    }
  } finally {
    quietly(() => reader.close());
  }
}

/** Where opened audio goes: told its exact length first, then given it in order. */
export type PlainSink = {
  begin(plaintextBytes: number): void | Promise<void>;
  chunk(bytes: Uint8Array): Promise<void>;
};

/**
 * Opens sealed audio of either format into a sink. A framed file is read and decrypted one frame at
 * a time. An earlier single-envelope file is read whole, as it always was.
 */
export async function openSealedAudio(
  aes: AesPort,
  key: AesKey,
  files: FilePort,
  id: string,
  uri: string,
  sink: PlainSink,
): Promise<void> {
  const reader = files.openReader(uri);
  let version: number | undefined;
  try {
    version = (await reader.read(0, 1))[0];
  } finally {
    quietly(() => reader.close());
  }
  if (version === ENVELOPE_VERSION) {
    const plain = await open(aes, key, KIND, id, await files.read(uri));
    await sink.begin(plain.length);
    await sink.chunk(plain);
    return;
  }
  if (version !== FRAMED_VERSION) throw new DecryptionError();
  await readFrames(aes, key, files, id, uri, sink);
}

/**
 * Seals `source` into `target` and proves it before `target` exists. The frames go to `target.tmp`,
 * then every frame is opened again from disk and compared with the plaintext, and only then is the
 * file renamed. So `target` is either absent or whole and verified, whatever stops this, and
 * `source` is never touched: whoever deletes it does so after this resolves, not before.
 */
export async function sealAudioFile(
  aes: AesPort,
  key: AesKey,
  files: FilePort,
  params: SealParams,
): Promise<void> {
  const pending = `${params.target}.tmp`;
  try {
    const total = await writeFrames(aes, key, files, { ...params, target: pending });
    await verifyFrames(aes, key, files, params, pending, total);
    await files.move(pending, params.target);
  } catch (error) {
    quietly(() => files.remove(pending));
    // Failing to open what was just written is a failure to seal it, not an unreadable recording.
    throw error instanceof DecryptionError ? new SealError() : error;
  }
}

/** Opens every frame of `sealed` again and compares it with the same range of the plaintext. */
async function verifyFrames(
  aes: AesPort,
  key: AesKey,
  files: FilePort,
  { id, source }: SealParams,
  sealed: string,
  sealedBytes: number,
): Promise<void> {
  const original = files.openReader(source);
  let at = 0;
  try {
    await readFrames(aes, key, files, id, sealed, {
      begin: (plaintextBytes) => {
        if (plaintextBytes !== sealedBytes) throw new SealError();
      },
      chunk: async (plain) => {
        const expected = await original.read(at, plain.length);
        if (!bytesEqual(expected, plain)) throw new SealError();
        at += plain.length;
      },
    });
    if (at !== sealedBytes) throw new SealError();
  } finally {
    quietly(() => original.close());
  }
}
