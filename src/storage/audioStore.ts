import { Directory, File, Paths } from 'expo-file-system';

import {
  CONTENT_ALGORITHM,
  contentCipher,
  isEncryptionAvailable,
  type EncryptedPayload,
} from './encryption';

/**
 * Encrypted audio at rest.
 *
 * Recordings are written by the platform recorder into the document directory
 * (survives cache eviction and interruption) and are immediately re-encrypted
 * here. Only the AES-256-GCM payload is kept; the plaintext recording is
 * deleted as soon as the encrypted copy is on disk. Nothing in this module
 * logs a path, payload or duration.
 */

export const AUDIO_DIRECTORY_NAME = 'echo-audio';
export const ENCRYPTED_AUDIO_EXTENSION = '.enc';

export class AudioStorageUnavailableError extends Error {
  constructor(reason?: unknown) {
    super('Encrypted audio storage is unavailable on this platform.');
    this.name = 'AudioStorageUnavailableError';
    this.reason = reason;
  }

  readonly reason?: unknown;
}

const textEncoder = (value: unknown) => JSON.stringify(value);

function audioDirectory(): Directory {
  return new Directory(Paths.document, AUDIO_DIRECTORY_NAME);
}

function ensureAudioDirectory(): Directory {
  const directory = audioDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

export function encryptedAudioFile(id: string): File {
  return new File(ensureAudioDirectory(), `${id}${ENCRYPTED_AUDIO_EXTENSION}`);
}

export function isEncryptedAudioPath(uri: string | null | undefined): boolean {
  return typeof uri === 'string' && uri.endsWith(ENCRYPTED_AUDIO_EXTENSION);
}

/**
 * Encrypts a freshly recorded file into the document directory and removes the
 * plaintext original. Returns `null` when encryption is unavailable so callers
 * never keep an unencrypted recording.
 */
export async function encryptAudioFile(
  sourceUri: string,
  id: string,
): Promise<{ path: string; byteLength: number } | null> {
  if (!(await isEncryptionAvailable())) {
    return null;
  }
  try {
    const source = new File(sourceUri);
    const bytes = await source.bytes();
    const payload = await contentCipher.encryptBytes(bytes);
    const target = encryptedAudioFile(id);
    target.write(textEncoder(payload));
    if (source.exists) {
      source.delete();
    }
    return { path: target.uri, byteLength: payload.ciphertextBase64.length };
  } catch (error) {
    throw new AudioStorageUnavailableError(error);
  }
}

export async function readEncryptedAudioPayload(uri: string): Promise<EncryptedPayload> {
  const payload = JSON.parse(await new File(uri).text()) as EncryptedPayload;
  if (payload.algorithm !== CONTENT_ALGORITHM) {
    throw new AudioStorageUnavailableError('unexpected algorithm');
  }
  return payload;
}

/**
 * Decrypts an encrypted recording into the cache directory for a single
 * authenticated upload. Callers must delete the returned file in a `finally`.
 */
export async function decryptAudioToCache(uri: string, id: string): Promise<string> {
  const payload = await readEncryptedAudioPayload(uri);
  const bytes = await contentCipher.decryptBytes(payload);
  const temp = new File(Paths.cache, `${id}.upload`);
  temp.write(bytes);
  return temp.uri;
}

export function deleteFileIfPresent(uri: string | null | undefined): void {
  if (!uri) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Deleting is best-effort; a missing file is already the desired state.
  }
}

export function audioFileExists(uri: string | null | undefined): boolean {
  if (!uri) {
    return false;
  }
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
