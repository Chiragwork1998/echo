import { concatBytes, utf8Decode, utf8Encode } from './bytes';
import type { AesKey, AesPort } from './ports';

/** One AES-GCM object for the whole value. The only format until audio was framed. */
export const ENVELOPE_VERSION = 1;
/** A file sealed in frames, each its own AES-GCM object: see sealedAudio.ts. */
export const FRAMED_VERSION = 2;

export type ObjectKind =
  | 'entry'
  | 'audio'
  | 'audio_meta'
  | 'reflection'
  | 'onboarding'
  | 'canary'
  | 'patterns'
  | 'breathe'
  | 'book';

/** Deliberately carries nothing from the failed object: errors can reach logs and crash reports. */
export class DecryptionError extends Error {
  constructor() {
    super('decryption failed');
    this.name = 'DecryptionError';
  }
}

/**
 * Additional authenticated data. GCM verifies this along with the ciphertext, so a ciphertext copied
 * onto another record, or reinterpreted as another kind of object, fails to open. Passed as bytes:
 * expo-crypto reads a string here as base64, which would quietly bind to the wrong value.
 */
function additionalData(kind: ObjectKind, id: string): Uint8Array {
  return utf8Encode(`echo/v${ENVELOPE_VERSION}\u0000${kind}\u0000${id}`);
}

/**
 * The AAD of one frame of a framed file. On top of what binds an envelope to its record (kind and
 * id), it binds the frame size, the frame's position, and whether it is the last one. A frame lifted
 * out of its file, moved within it, repeated, or left as the end of a file cut short therefore fails
 * to open. The position fields are fixed-width binary at the end, so they cannot be mistaken for
 * part of the id.
 */
export function frameAdditionalData(
  kind: ObjectKind,
  id: string,
  frameBytes: number,
  index: number,
  last: boolean,
): Uint8Array {
  const head = utf8Encode(`echo/v${FRAMED_VERSION}\u0000${kind}\u0000${id}\u0000`);
  const tail = new Uint8Array(9);
  const view = new DataView(tail.buffer);
  view.setUint32(0, frameBytes);
  view.setUint32(4, index);
  view.setUint8(8, last ? 1 : 0);
  return concatBytes(head, tail);
}

export async function seal(
  aes: AesPort,
  key: AesKey,
  kind: ObjectKind,
  id: string,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const sealed = await aes.encrypt(key, plaintext, additionalData(kind, id));
  return concatBytes(new Uint8Array([ENVELOPE_VERSION]), sealed);
}

export async function open(
  aes: AesPort,
  key: AesKey,
  kind: ObjectKind,
  id: string,
  envelope: Uint8Array,
): Promise<Uint8Array> {
  if (envelope[0] !== ENVELOPE_VERSION) throw new DecryptionError();
  try {
    return await aes.decrypt(key, envelope.slice(1), additionalData(kind, id));
  } catch {
    // A bad tag and a passing native fault arrive the same way, so this error means "did not open",
    // never "is corrupt". Nothing may destroy or replace data because of it alone.
    throw new DecryptionError();
  }
}

export const encodeJson = (value: unknown): Uint8Array => utf8Encode(JSON.stringify(value));

export function decodeJson<T>(bytes: Uint8Array): T {
  try {
    return JSON.parse(utf8Decode(bytes)) as T;
  } catch {
    // A JSON.parse message quotes the input, which here is decrypted journal content.
    throw new DecryptionError();
  }
}
