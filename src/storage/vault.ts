import { decodeJson, encodeJson, open, seal, type ObjectKind } from './envelope';
import type {
  AesKey,
  AesPort,
  FilePort,
  SecretStore,
  SqlDb,
  StoragePaths,
  WriteQueue,
} from './ports';

const KEY_NAME = 'echo.content-key.v1';
const CANARY_ROW = 'canary';
const CANARY_ID = 'v1';
const CANARY_VALUE = 'echo';

// One of each sealed kind is enough to prove a key: a wrong key opens none of them. The id is what
// each kind is bound to, and 'v1' is the onboarding record's. Several rows, so that damage to one
// cannot look like the wrong key.
const STORED_SAMPLES = `
  SELECT kind, id, sealed FROM (
    SELECT 'entry' AS kind, id, sealed FROM entries WHERE sealed IS NOT NULL
    UNION ALL SELECT 'audio_meta', id, sealed_meta FROM audio
    UNION ALL SELECT 'reflection', entry_id, sealed FROM reflections WHERE sealed IS NOT NULL
    UNION ALL SELECT 'onboarding', 'v1', sealed FROM sealed_kv WHERE key = 'onboarding'
  ) LIMIT 16`;

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
  /** Removes the key, then every sealed record. Only delete-all, after the data has gone. */
  destroyKey(): Promise<void>;
};

type Deps = {
  aes: AesPort;
  secrets: SecretStore;
  db: SqlDb;
  files: FilePort;
  paths: StoragePaths;
  now: () => number;
  serial: WriteQueue;
};

export function createVault({ aes, secrets, db, files, paths, now, serial }: Deps): Vault {
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
    await serial(() =>
      db.run('INSERT OR REPLACE INTO sealed_kv (key, sealed, updated_at) VALUES (?, ?, ?)', [
        CANARY_ROW,
        sealed,
        now(),
      ]),
    );
  }

  async function opens(
    candidate: AesKey,
    kind: ObjectKind,
    id: string,
    envelope: Uint8Array,
  ): Promise<boolean> {
    try {
      await open(aes, candidate, kind, id, envelope);
      return true;
    } catch {
      return false;
    }
  }

  /** One real object that opens proves the key, whatever the canary says. */
  async function opensStoredData(candidate: AesKey): Promise<boolean> {
    const rows = await db.all<{ kind: ObjectKind; id: string; sealed: Uint8Array }>(STORED_SAMPLES);
    for (const row of rows) {
      if (await opens(candidate, row.kind, row.id, row.sealed)) return true;
    }
    return false;
  }

  /** Whether AES is working at all right now, judged on bytes that have to open. */
  async function aesWorks(candidate: AesKey): Promise<boolean> {
    try {
      const sealed = await seal(aes, candidate, 'canary', CANARY_ID, encodeJson(CANARY_VALUE));
      return await opens(candidate, 'canary', CANARY_ID, sealed);
    } catch {
      return false;
    }
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
    if (!canary && !dataExists) {
      // A key with no data: an iOS reinstall (the Keychain outlives the app) or a crash mid-setup.
      await writeCanary(candidate);
      key = candidate;
      return { state: 'ready' };
    }
    if (canary) {
      const opensCanary = () => opens(candidate, 'canary', CANARY_ID, canary.sealed);
      if ((await opensCanary()) || (await opensCanary())) {
        key = candidate;
        return { state: 'ready' };
      }
    }

    // key_mismatch offers to erase everything, so it needs more than a canary that did not open. A
    // bad tag and a native fault look the same from here, and the canary itself can be damaged.
    if (await opensStoredData(candidate)) {
      await writeCanary(candidate);
      key = candidate;
      return { state: 'ready' };
    }
    if (!(await aesWorks(candidate))) return { state: 'unavailable', reason: 'database' };
    return { state: 'key_mismatch' };
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
      // Key first, so that a failure here changes nothing. The sealed records go after it rather than
      // with the journal's data, because they have to outlive every step that can fail: the app
      // carries on after one, and needs the canary to prove its key and the lock setting to stay on.
      await secrets.remove(KEY_NAME);
      key = null;
      await serial(() => db.run('DELETE FROM sealed_kv'));
    },
  };
}
