import { decodeJson, encodeJson, open, seal, type ObjectKind } from './envelope';
import type { AesKey, AesPort, FilePort, SecretStore, SqlDb, StoragePaths } from './ports';

const KEY_NAME = 'echo.content-key.v1';
const CANARY_ROW = 'canary';
const CANARY_ID = 'v1';
const CANARY_VALUE = 'echo';

export type VaultStatus =
  | { state: 'ready' }
  /** Encrypted data exists and no key does. A new key would strand all of it. */
  | { state: 'key_missing' }
  /** A key exists but it does not open the data on this device. */
  | { state: 'key_mismatch' }
  /** Could not find out. Often the device being locked, so retrying is the right response. */
  | { state: 'unavailable'; reason: 'secure_store' | 'database' };

export class VaultNotReadyError extends Error {
  constructor() {
    super('vault is not ready');
    this.name = 'VaultNotReadyError';
  }
}

export type Vault = {
  /** Resolves the key. The only path that may ever create one. */
  prepare(): Promise<VaultStatus>;
  sealBytes(kind: ObjectKind, id: string, plaintext: Uint8Array): Promise<Uint8Array>;
  openBytes(kind: ObjectKind, id: string, envelope: Uint8Array): Promise<Uint8Array>;
  sealJson(kind: ObjectKind, id: string, value: unknown): Promise<Uint8Array>;
  openJson<T>(kind: ObjectKind, id: string, envelope: Uint8Array): Promise<T>;
  /** Removes the key from the device. Only delete-all may call this. */
  destroyKey(): Promise<void>;
};

type Deps = {
  aes: AesPort;
  secrets: SecretStore;
  db: SqlDb;
  files: FilePort;
  paths: StoragePaths;
  now: () => number;
};

export function createVault({ aes, secrets, db, files, paths, now }: Deps): Vault {
  let key: AesKey | null = null;

  const requireKey = (): AesKey => {
    if (!key) throw new VaultNotReadyError();
    return key;
  };

  async function hasEncryptedData(): Promise<boolean> {
    const row = await db.first<{ total: number }>(
      `SELECT (SELECT COUNT(*) FROM sealed_kv) + (SELECT COUNT(*) FROM entries) +
              (SELECT COUNT(*) FROM audio) + (SELECT COUNT(*) FROM reflections) AS total`,
    );
    return (row?.total ?? 0) > 0 || files.list(paths.audioDir).length > 0;
  }

  async function writeCanary(candidate: AesKey): Promise<void> {
    const sealed = await seal(aes, candidate, 'canary', CANARY_ID, encodeJson(CANARY_VALUE));
    await db.run('INSERT INTO sealed_kv (key, sealed, updated_at) VALUES (?, ?, ?)', [
      CANARY_ROW,
      sealed,
      now(),
    ]);
  }

  /** First run only, and only after hasEncryptedData has said there is nothing to strand. */
  async function createKey(): Promise<VaultStatus> {
    try {
      const encoded = await aes.generateKey();
      await secrets.set(KEY_NAME, encoded);
      // Never encrypt under a key that is not provably retrievable.
      if ((await secrets.get(KEY_NAME)) !== encoded) {
        return { state: 'unavailable', reason: 'secure_store' };
      }
      const candidate = await aes.importKey(encoded);
      await writeCanary(candidate);
      key = candidate;
      return { state: 'ready' };
    } catch {
      return { state: 'unavailable', reason: 'secure_store' };
    }
  }

  async function adoptKey(encoded: string, dataExists: boolean): Promise<VaultStatus> {
    let candidate: AesKey;
    try {
      candidate = await aes.importKey(encoded);
    } catch {
      return dataExists ? { state: 'key_mismatch' } : createKey();
    }
    const canary = await db.first<{ sealed: Uint8Array }>(
      'SELECT sealed FROM sealed_kv WHERE key = ?',
      [CANARY_ROW],
    );
    if (!canary) {
      if (dataExists) return { state: 'key_mismatch' };
      // A key with no data: an iOS reinstall (the Keychain outlives the app) or a crash mid-setup.
      await writeCanary(candidate);
      key = candidate;
      return { state: 'ready' };
    }
    try {
      await open(aes, candidate, 'canary', CANARY_ID, canary.sealed);
    } catch {
      return { state: 'key_mismatch' };
    }
    key = candidate;
    return { state: 'ready' };
  }

  return {
    async prepare() {
      key = null;
      let dataExists: boolean;
      try {
        dataExists = await hasEncryptedData();
      } catch {
        return { state: 'unavailable', reason: 'database' };
      }
      let encoded: string | null;
      try {
        encoded = await secrets.get(KEY_NAME);
      } catch {
        // Not the same as missing: the Keychain refuses reads while the device is locked. Treating
        // this as missing is how a working key gets replaced.
        return { state: 'unavailable', reason: 'secure_store' };
      }
      try {
        if (encoded !== null) return await adoptKey(encoded, dataExists);
        return dataExists ? { state: 'key_missing' } : await createKey();
      } catch {
        return { state: 'unavailable', reason: 'database' };
      }
    },
    sealBytes: async (kind, id, plaintext) => seal(aes, requireKey(), kind, id, plaintext),
    openBytes: async (kind, id, envelope) => open(aes, requireKey(), kind, id, envelope),
    sealJson: async (kind, id, value) => seal(aes, requireKey(), kind, id, encodeJson(value)),
    openJson: async <T>(kind: ObjectKind, id: string, envelope: Uint8Array) =>
      decodeJson<T>(await open(aes, requireKey(), kind, id, envelope)),
    async destroyKey() {
      await secrets.remove(KEY_NAME);
      key = null;
    },
  };
}
