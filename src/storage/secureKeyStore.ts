import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { base64ToBytes, bytesToBase64 } from './bytes';

/**
 * Device key material boundary (`docs/ARCHITECTURE.md` § Privacy and security).
 *
 * The content-encryption key is generated on device and never leaves
 * Keychain/Keystore. It is stored with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` so it
 * is not restored onto a different device from an encrypted backup, and it is
 * deliberately not exportable: cross-device recovery is an open product
 * decision (`docs/DECISIONS_REQUIRED.md`).
 */

export const CONTENT_KEY_ID = 'echo.contentKey.v1';
export const CONTENT_KEY_BYTES = 32;

/** Web preview builds have no Keychain; persistence is unavailable there. */
export function isSecureStorageSupported(): boolean {
  return Platform.OS !== 'web';
}

export class KeyMaterialUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      'Device key material is unavailable on this platform, so content cannot be encrypted at rest.',
    );
    this.name = 'KeyMaterialUnavailableError';
    this.cause = cause;
  }
}

let cachedKey: Uint8Array | null = null;
let loading: Promise<Uint8Array> | null = null;

function validate(key: Uint8Array): Uint8Array {
  if (key.length !== CONTENT_KEY_BYTES) {
    throw new KeyMaterialUnavailableError(`unexpected key length ${key.length}`);
  }
  return key;
}

async function loadOrCreate(): Promise<Uint8Array> {
  if (!isSecureStorageSupported()) {
    throw new KeyMaterialUnavailableError('secure storage unsupported');
  }
  try {
    const stored = await SecureStore.getItemAsync(CONTENT_KEY_ID, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (stored) {
      cachedKey = validate(base64ToBytes(stored));
      return cachedKey;
    }
    const generated = Crypto.getRandomBytes(CONTENT_KEY_BYTES);
    await SecureStore.setItemAsync(CONTENT_KEY_ID, bytesToBase64(generated), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    cachedKey = generated;
    return generated;
  } catch (error) {
    throw new KeyMaterialUnavailableError(error);
  }
}

/** Resolves the 32-byte AES key, generating it on first use. */
export function getContentKey(): Promise<Uint8Array> {
  if (cachedKey) {
    return Promise.resolve(cachedKey);
  }
  loading ??= loadOrCreate().catch((error: unknown) => {
    // Allow a later attempt to retry instead of caching the rejection forever.
    loading = null;
    throw error;
  });
  return loading;
}

export async function hasContentKey(): Promise<boolean> {
  if (!isSecureStorageSupported()) {
    return false;
  }
  try {
    await getContentKey();
    return true;
  } catch {
    return false;
  }
}

/** Test/reset hook; drops the cached key without deleting Keychain material. */
export function forgetCachedContentKey(): void {
  cachedKey = null;
  loading = null;
}
