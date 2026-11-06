import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DatabaseTooNewError, migrate, migrations, type Migration } from './migrations';
import { openTestDb, type TestDb } from './testing/nodePorts';

function freshDb(): TestDb {
  return openTestDb(join(mkdtempSync(join(tmpdir(), 'echo-migrate-')), 'echo.db'));
}

const userVersion = async (db: TestDb) =>
  (await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version;

const tables = async (db: TestDb) =>
  (
    await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
  ).map((row) => row.name);

const latest = Math.max(...migrations.map((migration) => migration.version));
const sealed = new Uint8Array([1, 2, 3]);

describe('migrate', () => {
  it('builds the schema from an empty database and records the version', async () => {
    const db = freshDb();
    await migrate(db);
    expect(await userVersion(db)).toBe(latest);
    expect(await tables(db)).toEqual([
      'audio',
      'entries',
      'preferences',
      'recordings',
      'reflections',
      'sealed_kv',
    ]);
  });

  it('versions are unique and ascending from 1', () => {
    expect(migrations.map((migration) => migration.version)).toEqual(
      migrations.map((_, index) => index + 1),
    );
  });

  it('does nothing when already current', async () => {
    const db = freshDb();
    await migrate(db);
    await db.run('INSERT INTO preferences (key, value) VALUES (?, ?)', ['theme', 'day']);
    await migrate(db);
    expect(await db.first('SELECT value FROM preferences')).toEqual({ value: 'day' });
  });

  it('applies only pending migrations, in order, keeping existing rows', async () => {
    const db = freshDb();
    await migrate(db);
    await db.run(
      `INSERT INTO entries (id, status, sealed, created_at, updated_at) VALUES (?, 'draft', ?, 1, 1)`,
      ['kept', sealed],
    );
    const next = latest + 1;
    const upgrade: Migration[] = [
      { version: next + 1, up: "UPDATE entries SET note = 'second' WHERE note = 'first'" },
      { version: next, up: "ALTER TABLE entries ADD COLUMN note TEXT DEFAULT 'first'" },
    ];
    await migrate(db, [...migrations, ...upgrade]);

    expect(await userVersion(db)).toBe(next + 1);
    expect(await db.first('SELECT id, note FROM entries')).toEqual({ id: 'kept', note: 'second' });
  });

  it('rolls a failed migration back whole and keeps the data', async () => {
    const db = freshDb();
    await migrate(db);
    await db.run('INSERT INTO preferences (key, value) VALUES (?, ?)', ['theme', 'day']);
    const broken: Migration = {
      version: latest + 1,
      up: `
        ALTER TABLE preferences ADD COLUMN half_done TEXT;
        DELETE FROM preferences;
        THIS IS NOT SQL;
      `,
    };
    await expect(migrate(db, [...migrations, broken])).rejects.toThrow();

    expect(await userVersion(db)).toBe(latest);
    expect(await db.first('SELECT * FROM preferences')).toEqual({ key: 'theme', value: 'day' });
  });

  it('refuses a database written by a newer app and leaves it untouched', async () => {
    const db = freshDb();
    await migrate(db);
    await db.exec(`PRAGMA user_version = ${latest + 1}`);
    await expect(migrate(db)).rejects.toBeInstanceOf(DatabaseTooNewError);
    expect(await userVersion(db)).toBe(latest + 1);
  });
});

describe('schema rules', () => {
  const insert = (db: TestDb, columns: string, values: string) =>
    db.exec(`INSERT INTO entries (id, status, created_at, updated_at${columns}) VALUES ${values}`);

  it('forbids a live entry with no ciphertext', async () => {
    const db = freshDb();
    await migrate(db);
    await expect(insert(db, '', "('a', 'draft', 1, 1)")).rejects.toThrow(/CHECK/);
  });

  it('forbids a tombstone that still holds ciphertext', async () => {
    const db = freshDb();
    await migrate(db);
    await expect(
      insert(db, ', sealed, deleted_at', "('a', 'draft', 1, 1, x'01', 2)"),
    ).rejects.toThrow(/CHECK/);
  });

  it('forbids a committed entry with no local day', async () => {
    const db = freshDb();
    await migrate(db);
    await expect(insert(db, ', sealed', "('a', 'committed', 1, 1, x'01')")).rejects.toThrow(
      /CHECK/,
    );
  });

  it('removes audio and reflection rows along with their entry', async () => {
    const db = freshDb();
    await migrate(db);
    await insert(db, ', sealed', "('a', 'draft', 1, 1, x'01')");
    await db.run('INSERT INTO audio (id, entry_id, sealed_meta, created_at) VALUES (?, ?, ?, 1)', [
      'b',
      'a',
      sealed,
    ]);
    await db.run('DELETE FROM entries WHERE id = ?', ['a']);
    expect(await db.all('SELECT * FROM audio')).toEqual([]);
  });
});
