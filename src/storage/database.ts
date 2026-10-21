import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { MIGRATIONS, SCHEMA_VERSION } from './migrations';

/**
 * Local-first SQLite store (`docs/ARCHITECTURE.md` § Local-first rules).
 *
 * Only ciphertext plus non-sensitive metadata is written here; the encryption
 * boundary (`src/storage/encryption.ts`) runs before any repository call.
 * Web preview builds have no Keychain and therefore no encrypted store, so the
 * database is unavailable there and repositories fall back to session memory.
 */

export const DATABASE_NAME = 'echo.db';
export { SCHEMA_VERSION };

export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Encrypted local storage is unavailable on this platform.');
    this.name = 'StorageUnavailableError';
    this.reason = cause;
  }

  readonly reason?: unknown;
}

export class SchemaTooNewError extends Error {
  readonly found: number;
  readonly supported: number;

  constructor(found: number) {
    super(`Local database schema ${found} is newer than this app build (${SCHEMA_VERSION}).`);
    this.name = 'SchemaTooNewError';
    this.found = found;
    this.supported = SCHEMA_VERSION;
  }
}

export function isDatabaseSupported(): boolean {
  return Platform.OS !== 'web';
}

let database: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const applied = row?.user_version ?? 0;
  if (applied > SCHEMA_VERSION) {
    throw new SchemaTooNewError(applied);
  }
  for (const migration of MIGRATIONS) {
    if (migration.version <= applied) {
      continue;
    }
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
    });
    // PRAGMA values cannot be bound; versions come from local constants only.
    await db.execAsync(`PRAGMA user_version = ${migration.version};`);
  }
}

/** Opens (once per process) and migrates the encrypted local database. */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!isDatabaseSupported()) {
    return Promise.reject(new StorageUnavailableError('unsupported platform'));
  }
  database ??= open().catch((error: unknown) => {
    // Do not cache a failed open; the next call retries.
    database = null;
    throw error instanceof StorageUnavailableError ? error : new StorageUnavailableError(error);
  });
  return database;
}

/** Test/reset hook: closes and reopens the database handle. */
export async function closeDatabase(): Promise<void> {
  if (!database) {
    return;
  }
  const pending = database;
  database = null;
  try {
    const db = await pending;
    await db.closeAsync();
  } catch {
    // A database that failed to open has nothing to close.
  }
}
