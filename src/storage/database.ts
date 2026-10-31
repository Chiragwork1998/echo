import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { MIGRATIONS, SCHEMA_VERSION } from './migrations';
import { getWorkspaceScope, type WorkspaceScope } from './workspace';

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

const databases: Partial<Record<WorkspaceScope, Promise<SQLite.SQLiteDatabase>>> = {};

async function open(scope: WorkspaceScope): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(scope === 'guest' ? 'echo-guest.db' : DATABASE_NAME);
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
export function getDatabase(scope: WorkspaceScope = getWorkspaceScope()): Promise<SQLite.SQLiteDatabase> {
  if (!isDatabaseSupported()) {
    return Promise.reject(new StorageUnavailableError('unsupported platform'));
  }
  databases[scope] ??= open(scope).catch((error: unknown) => {
    // Do not cache a failed open; the next call retries.
    delete databases[scope];
    throw error instanceof StorageUnavailableError ? error : new StorageUnavailableError(error);
  });
  return databases[scope];
}

/** Test/reset hook: closes and reopens the database handle. */
export async function closeDatabase(): Promise<void> {
  await Promise.all(Object.entries(databases).map(async ([scope, pending]) => {
    delete databases[scope as WorkspaceScope];
    try { await (await pending).closeAsync(); } catch { /* A failed open has no handle. */ }
  }));
}
