// The real device implementations. Loaded on demand by runtime.ts and never bundled on web.
import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  randomUUID,
} from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { openDatabaseAsync } from 'expo-sqlite';

import type {
  AesKey,
  AesPort,
  FilePort,
  SecretStore,
  SqlDb,
  SqlValue,
  StoragePaths,
} from './ports';

const DATABASE_NAME = 'echo.db';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

type NativeKey = Awaited<ReturnType<typeof AESEncryptionKey.import>>;
const toNative = (key: AesKey) => key as unknown as NativeKey;

export const expoAes: AesPort = {
  async generateKey() {
    const key = await AESEncryptionKey.generate(AESKeySize.AES256);
    return key.encoded('base64');
  },
  async importKey(encoded) {
    const key = await AESEncryptionKey.import(encoded, 'base64');
    return key as unknown as AesKey;
  },
  async encrypt(key, plaintext, aad) {
    const sealed = await aesEncryptAsync(plaintext, toNative(key), {
      nonce: { length: NONCE_BYTES },
      tagLength: TAG_BYTES,
      additionalData: aad,
    });
    return sealed.combined('bytes');
  },
  async decrypt(key, sealed, aad) {
    const parsed = AESSealedData.fromCombined(sealed, {
      ivLength: NONCE_BYTES,
      tagLength: TAG_BYTES,
    });
    return aesDecryptAsync(parsed, toNative(key), { additionalData: aad, output: 'bytes' });
  },
};

// Device-only: the key is never synced to iCloud and never restored onto another phone.
// WHEN_PASSCODE_SET_THIS_DEVICE_ONLY is the wrong choice here: iOS deletes those items when the user
// removes their passcode. requireAuthentication stays off for the same reason: both platforms
// invalidate such a key when biometric enrolment changes, which would strand every entry. The
// biometric lock is a separate gate in front of the app, not part of the key.
const secretOptions: SecureStore.SecureStoreOptions = {
  keychainService: 'echo.keys',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const expoSecrets: SecretStore = {
  get: (name) => SecureStore.getItemAsync(name, secretOptions),
  set: (name, value) => SecureStore.setItemAsync(name, value, secretOptions),
  remove: (name) => SecureStore.deleteItemAsync(name, secretOptions),
};

export async function openNativeDatabase(): Promise<SqlDb> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  // synchronous = FULL: in WAL mode the default can lose the latest commit on power loss, and a
  // commit here is a promise to the user. secure_delete zeroes freed pages.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
  `);
  return {
    exec: (source) => db.execAsync(source),
    run: (source, params: SqlValue[] = []) => db.runAsync(source, params),
    all: <T>(source: string, params: SqlValue[] = []) => db.getAllAsync<T>(source, params),
    first: <T>(source: string, params: SqlValue[] = []) => db.getFirstAsync<T>(source, params),
    transaction: (task) => db.withTransactionAsync(task),
  };
}

export const expoFiles: FilePort = {
  read: (uri) => new File(uri).bytes(),
  // Honest limit: expo-file-system has no fsync on either platform, so the bytes and the rename can
  // both still be in the OS cache when this resolves. That survives an app crash, not a power loss.
  // sealRecording's read-back is served from the same cache, so it cannot prove more than that.
  async writeAtomic(uri, bytes) {
    const target = new File(uri);
    target.parentDirectory.create({ idempotent: true, intermediates: true });
    const pending = new File(`${uri}.tmp`);
    pending.create({ overwrite: true });
    await pending.write(bytes);
    await pending.move(target, { overwrite: true });
  },
  remove(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  list(directory) {
    const dir = new Directory(directory);
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((item): item is File => item instanceof File)
      .map((file) => ({ uri: file.uri, name: file.name, size: file.size }));
  },
  removeDirectory(directory) {
    const dir = new Directory(directory);
    if (dir.exists) dir.delete();
  },
  ensureDirectory(directory) {
    new Directory(directory).create({ idempotent: true, intermediates: true });
  },
  openWriter(uri) {
    const file = new File(uri);
    file.create({ overwrite: true });
    const handle = file.open(FileMode.WriteOnly);
    return { write: (bytes) => handle.writeBytes(bytes), close: () => handle.close() };
  },
};

export function nativePaths(): StoragePaths {
  return {
    audioDir: new Directory(Paths.document, 'echo', 'audio').uri,
    // expo-audio writes to <cache>/Audio on Android and <cache>/ExpoAudio on iOS.
    recordingDirs: [
      new Directory(Paths.cache, 'Audio').uri,
      new Directory(Paths.cache, 'ExpoAudio').uri,
    ],
    tempDir: new Directory(Paths.cache, 'echo-temp').uri,
  };
}

export const newNativeId = (): string => randomUUID();
