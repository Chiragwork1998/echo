import type { SqlDb } from './ports';

export type Migration = { version: number; up: string };

/**
 * What stays readable without the key, and why:
 * - ids, timestamps, status, and local_day: needed to order entries and derive rhythm without
 *   decrypting. They reveal when someone wrote, never what, and never where: no timezone is kept.
 * - preferences: theme, read before anything is decrypted.
 *
 * Everything personal lives in a sealed column: entry title, body, mood, prompt, mode, duration,
 * audio details, reflection text, and all onboarding choices.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE entries (
        id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'committed')),
        sealed BLOB,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        committed_at INTEGER,
        local_day TEXT,
        deleted_at INTEGER,
        CHECK ((deleted_at IS NULL) = (sealed IS NOT NULL)),
        CHECK (deleted_at IS NOT NULL OR status = 'draft' OR local_day IS NOT NULL)
      );
      CREATE INDEX entries_by_status ON entries (status, deleted_at, committed_at);

      CREATE TABLE audio (
        id TEXT PRIMARY KEY NOT NULL,
        entry_id TEXT NOT NULL UNIQUE REFERENCES entries (id) ON DELETE CASCADE,
        sealed_meta BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- One row from the moment a recording starts until its plaintext file is gone. Sealed rows
      -- keep the launch sweep from reviving audio that is already encrypted, or already deleted.
      CREATE TABLE recordings (
        id TEXT PRIMARY KEY NOT NULL,
        draft_id TEXT,
        started_at INTEGER NOT NULL,
        sealed_at INTEGER
      );

      CREATE TABLE reflections (
        entry_id TEXT PRIMARY KEY NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'error', 'offline')),
        sealed BLOB,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE sealed_kv (
        key TEXT PRIMARY KEY NOT NULL,
        sealed BLOB NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE preferences (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
];

/** A newer app wrote this database. Running old code against it could destroy data. */
export class DatabaseTooNewError extends Error {
  constructor() {
    super('database is newer than this app');
    this.name = 'DatabaseTooNewError';
  }
}

export async function migrate(db: SqlDb, list: Migration[] = migrations): Promise<void> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  const latest = list.reduce((max, migration) => Math.max(max, migration.version), 0);
  if (current > latest) throw new DatabaseTooNewError();

  const pending = list
    .filter((migration) => migration.version > current)
    .sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    // user_version is part of the database header, so it rolls back with the schema change.
    await db.transaction(async () => {
      await db.exec(migration.up);
      await db.exec(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
