/**
 * Forward-only SQLite migrations.
 *
 * `PRAGMA user_version` tracks the applied schema. Add a new entry instead of
 * editing a released one, and keep every statement idempotent.
 */

export type Migration = {
  version: number;
  statements: readonly string[];
};

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS onboarding_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        prompt_id TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        mode TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        sync_state TEXT NOT NULL DEFAULT 'local',
        revision INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT,
        content_state TEXT NOT NULL DEFAULT 'available',
        cipher TEXT NOT NULL,
        nonce TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        audio_path TEXT,
        reflection_status TEXT,
        reflection_cipher TEXT,
        reflection_nonce TEXT,
        reflection_algorithm TEXT,
        reflection_hash TEXT,
        reflection_updated_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS journal_entries_created_at
        ON journal_entries (created_at DESC);`,
      `CREATE TABLE IF NOT EXISTS journal_drafts (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        entry_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        prompt_id TEXT NOT NULL,
        prompt_text TEXT NOT NULL,
        mode TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        content_state TEXT NOT NULL DEFAULT 'available',
        cipher TEXT NOT NULL,
        nonce TEXT NOT NULL,
        algorithm TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        audio_path TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS recording_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        entry_id TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        path TEXT,
        encrypted_path TEXT,
        duration_seconds REAL NOT NULL DEFAULT 0,
        prompt_id TEXT,
        prompt_text TEXT,
        status TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS recording_sessions_status
        ON recording_sessions (status);`,
    ],
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
