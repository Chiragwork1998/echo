import { concatBytes, utf8Decode, utf8Encode } from './bytes';
import type { AesKey, AesPort } from './ports';

const ENVELOPE_VERSION = 1;

export type ObjectKind = 'entry' | 'audio' | 'audio_meta' | 'reflection' | 'onboarding' | 'canary';

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
