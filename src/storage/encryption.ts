import { gcm } from '@noble/ciphers/aes';
import * as Crypto from 'expo-crypto';

import { base64ToBytes, bytesToBase64, bytesToHex, bytesToUtf8, utf8ToBytes } from './bytes';
import { getContentKey, hasContentKey, isSecureStorageSupported } from './secureKeyStore';

/**
 * Content encryption boundary.
 *
 * Journal text, prompt answers, reflections and audio must cross this boundary
 * before they are written anywhere — local database, files or sync — and must
 * never be replaced by reversible obfuscation.
 *
 * Authenticated encryption is AES-256-GCM. The key lives in Keychain/Keystore
 * (`src/storage/secureKeyStore.ts`) and every payload gets a fresh 96-bit
 * nonce. Nothing here logs plaintext, ciphertext or key material.
 */

export const CONTENT_ALGORITHM = 'A256GCM' as const;

export type EncryptedPayload = {
  algorithm: typeof CONTENT_ALGORITHM;
  nonceBase64: string;
  ciphertextBase64: string;
  /** Hex SHA-256 of the plaintext, used for conflict detection only. */
  contentHash: string;
};

export interface ContentCipher {
  encrypt(plaintext: string): Promise<EncryptedPayload>;
  decrypt(payload: EncryptedPayload): Promise<string>;
  encryptBytes(plaintext: Uint8Array): Promise<EncryptedPayload>;
  decryptBytes(payload: EncryptedPayload): Promise<Uint8Array>;
}

export class EncryptionUnavailableError extends Error {
  readonly reason: unknown;

  constructor(reason?: unknown) {
    super(
      'Content encryption is unavailable on this platform; journal content is not persisted.',
    );
    this.name = 'EncryptionUnavailableError';
    this.reason = reason;
  }
}

export class DecryptionFailedError extends Error {
  constructor() {
    super('Stored content failed authentication and could not be decrypted.');
    this.name = 'DecryptionFailedError';
  }
}

const NONCE_BYTES = 12;

async function hash(plaintext: Uint8Array): Promise<string> {
  // Copy into a plain ArrayBuffer so the digest sees a `BufferSource` that is
  // never backed by SharedArrayBuffer.
  const buffer = plaintext.buffer.slice(
    plaintext.byteOffset,
    plaintext.byteOffset + plaintext.byteLength,
  ) as ArrayBuffer;
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buffer);
  return bytesToHex(new Uint8Array(digest));
}

async function encryptBytes(plaintext: Uint8Array): Promise<EncryptedPayload> {
  let key: Uint8Array;
  try {
    key = await getContentKey();
  } catch (error) {
    throw new EncryptionUnavailableError(error);
  }
  const nonce = Crypto.getRandomBytes(NONCE_BYTES);
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return {
    algorithm: CONTENT_ALGORITHM,
    nonceBase64: bytesToBase64(nonce),
    ciphertextBase64: bytesToBase64(ciphertext),
    contentHash: await hash(plaintext),
  };
}

async function decryptBytes(payload: EncryptedPayload): Promise<Uint8Array> {
  if (payload.algorithm !== CONTENT_ALGORITHM) {
    throw new DecryptionFailedError();
  }
  let key: Uint8Array;
  try {
    key = await getContentKey();
  } catch (error) {
    throw new EncryptionUnavailableError(error);
  }
  const nonce = base64ToBytes(payload.nonceBase64);
  const ciphertext = base64ToBytes(payload.ciphertextBase64);
  if (nonce.length !== NONCE_BYTES || ciphertext.length === 0) {
    throw new DecryptionFailedError();
  }
  try {
    return gcm(key, nonce).decrypt(ciphertext);
  } catch {
    throw new DecryptionFailedError();
  }
}

export const contentCipher: ContentCipher = {
  async encrypt(plaintext: string): Promise<EncryptedPayload> {
    return encryptBytes(utf8ToBytes(plaintext));
  },
  async decrypt(payload: EncryptedPayload): Promise<string> {
    return bytesToUtf8(await decryptBytes(payload));
  },
  encryptBytes,
  decryptBytes,
};

/** True once the device key can be read or created. */
export function isEncryptionAvailable(): Promise<boolean> {
  if (!isSecureStorageSupported()) {
    return Promise.resolve(false);
  }
  return hasContentKey();
}

/** Re-verifies that a stored payload still authenticates with the device key. */
export async function verifyPayloadIntegrity(payload: EncryptedPayload): Promise<boolean> {
  try {
    const plaintext = await decryptBytes(payload);
    return (await hash(plaintext)) === payload.contentHash;
  } catch {
    return false;
  }
}
