// Real implementations for Jest: node:crypto for AES-GCM, node:sqlite for SQL, node:fs for files.
// Never imported by app code.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRuntime, type Runtime, type StoragePorts } from '../runtime';
import type { AesKey, AesPort, FilePort, SecretStore, SqlDb, SqlValue } from '../ports';

const NONCE = 12;
const TAG = 16;

export const nodeAes: AesPort = {
  generateKey: async () => randomBytes(32).toString('base64'),
  importKey: async (encoded) => {
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length !== 32) throw new Error('bad key');
    return bytes as unknown as AesKey;
  },
  async encrypt(key, plaintext, aad) {
    const nonce = randomBytes(NONCE);
    const cipher = createCipheriv('aes-256-gcm', key as unknown as Buffer, nonce);
    cipher.setAAD(aad);
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return new Uint8Array(Buffer.concat([nonce, body, cipher.getAuthTag()]));
  },
  async decrypt(key, sealed, aad) {
    const input = Buffer.from(sealed);
    const nonce = input.subarray(0, NONCE);
    const body = input.subarray(NONCE, input.length - TAG);
    const decipher = createDecipheriv('aes-256-gcm', key as unknown as Buffer, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(input.subarray(input.length - TAG));
    return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
  },
};

export type MemorySecrets = SecretStore & {
  items: Map<string, string>;
  /** Makes the next reads reject, as the Keychain does while the device is locked. */
  failReads: boolean;
  /**
   * Android's Keystore key is gone or no longer matches, after a reinstall or a restore. The next
   * read does not fail: it deletes the stored item and answers null as if there had never been one
   * (SecureStoreModule.kt:142,167 in expo-secure-store). Writing makes a new Keystore key.
   */
  keystoreLost: boolean;
  writes: number;
};

export function memorySecrets(): MemorySecrets {
  const items = new Map<string, string>();
  const store: MemorySecrets = {
    items,
    failReads: false,
    keystoreLost: false,
    writes: 0,
    async get(name) {
      if (store.failReads) throw new Error('interaction not allowed');
      if (store.keystoreLost) items.delete(name);
      return items.get(name) ?? null;
    },
    async set(name, value) {
      store.writes += 1;
      store.keystoreLost = false;
      items.set(name, value);
    },
    async remove(name) {
      items.delete(name);
    },
  };
  return store;
}

type NodeDatabase = InstanceType<typeof import('node:sqlite').DatabaseSync>;

export type TestDb = SqlDb & { raw: NodeDatabase; close(): void; file: string };

export function openTestDb(file: string): TestDb {
  // Through getBuiltinModule because Jest's module loader does not know node:sqlite.
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const raw = new DatabaseSync(file);
  raw.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
  `);
  const db: TestDb = {
    raw,
    file,
    close: () => raw.close(),
    exec: async (source) => {
      raw.exec(source);
    },
    run: async (source, params: SqlValue[] = []) => {
      const result = raw.prepare(source).run(...params);
      return { changes: Number(result.changes) };
    },
    all: async <T>(source: string, params: SqlValue[] = []) =>
      raw.prepare(source).all(...params) as T[],
    first: async <T>(source: string, params: SqlValue[] = []) =>
      (raw.prepare(source).get(...params) as T | undefined) ?? null,
    transaction: async (task) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return db;
}

export const nodeFiles: FilePort = {
  read: async (uri) => new Uint8Array(readFileSync(uri)),
  size: (uri) => statSync(uri).size,
  openReader(uri) {
    const descriptor = openSync(uri, 'r');
    const size = fstatSync(descriptor).size;
    let open = true;
    return {
      size,
      read: async (offset, length) => {
        const out = new Uint8Array(length);
        let have = 0;
        while (have < length) {
          const got = readSync(descriptor, out, have, length - have, offset + have);
          if (got === 0) break;
          have += got;
        }
        return have === length ? out : out.slice(0, have);
      },
      close: () => {
        // Like the device's handles, closing twice is not an error.
        if (open) closeSync(descriptor);
        open = false;
      },
    };
  },
  async move(from, to) {
    mkdirSync(join(to, '..'), { recursive: true });
    renameSync(from, to);
  },
  async writeAtomic(uri, bytes) {
    mkdirSync(join(uri, '..'), { recursive: true });
    writeFileSync(`${uri}.tmp`, bytes);
    renameSync(`${uri}.tmp`, uri);
  },
  remove: (uri) => rmSync(uri, { force: true }),
  list(directory) {
    if (!existsSync(directory)) return [];
    return readdirSync(directory)
      .map((name) => ({ name, uri: join(directory, name) }))
      .filter((file) => statSync(file.uri).isFile())
      .map((file) => ({ ...file, size: statSync(file.uri).size }));
  },
  removeDirectory: (directory) => rmSync(directory, { recursive: true, force: true }),
  ensureDirectory: (directory) => {
    mkdirSync(directory, { recursive: true });
  },
  openWriter(uri) {
    mkdirSync(join(uri, '..'), { recursive: true });
    const descriptor = openSync(uri, 'w');
    let open = true;
    return {
      write: async (bytes) => {
        for (let done = 0; done < bytes.length;) {
          done += writeSync(descriptor, bytes, done, bytes.length - done);
        }
      },
      close: () => {
        if (open) closeSync(descriptor);
        open = false;
      },
    };
  },
};

export type TestRuntime = Runtime & {
  db: TestDb;
  secrets: MemorySecrets;
  root: string;
  /** Simulates process death: closes the database and reopens from what reached the disk. */
  reopen(): Promise<TestRuntime>;
};

type Options = { root?: string; secrets?: MemorySecrets; files?: FilePort; now?: () => number };

export async function createTestRuntime(options: Options = {}): Promise<TestRuntime> {
  const root = options.root ?? mkdtempSync(join(tmpdir(), 'echo-test-'));
  const secrets = options.secrets ?? memorySecrets();
  const db = openTestDb(join(root, 'echo.db'));
  const ports: StoragePorts = {
    aes: nodeAes,
    secrets,
    db,
    files: options.files ?? nodeFiles,
    paths: {
      audioDir: join(root, 'documents', 'audio'),
      recordingDirs: [join(root, 'cache', 'Audio'), join(root, 'cache', 'ExpoAudio')],
      tempDir: join(root, 'cache', 'echo-temp'),
    },
    newId: () => randomUUID(),
    now: options.now ?? (() => Date.now()),
  };
  const runtime = await createRuntime(ports);
  const status = await runtime.vault.prepare();
  if (status.state !== 'ready') throw new Error(`vault ${status.state}`);
  return {
    ...runtime,
    db,
    secrets,
    root,
    reopen: () => {
      db.close();
      return createTestRuntime({ ...options, root, secrets });
    },
  };
}

/** Every byte ECHO has put on disk, including the write-ahead log. */
export function everyStoredByte(root: string): Buffer {
  const chunks: Buffer[] = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path);
      else chunks.push(readFileSync(path));
    }
  };
  walk(root);
  return Buffer.concat(chunks);
}
