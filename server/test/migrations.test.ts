import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { createPostgresDependency } from '../src/database.js';

const { Client } = pg;
const expectedTables = [
  'accounts',
  'auth_identities',
  'consent_records',
  'deletion_jobs',
  'devices',
  'export_jobs',
  'idempotency_records',
  'recovery_envelopes',
  'reflection_jobs',
  'sessions',
  'stored_objects',
  'sync_cursors',
  'sync_items',
];

const databaseUrl = process.env['TEST_DATABASE_URL'];
let client: InstanceType<typeof Client>;

async function createAccountAndDevice(): Promise<{
  accountId: string;
  deviceId: string;
}> {
  const account = await client.query<{ id: string }>(
    'INSERT INTO echo.accounts DEFAULT VALUES RETURNING id',
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) throw new Error('Account insert did not return an id');

  const device = await client.query<{ id: string }>(
    `INSERT INTO echo.devices (account_id, public_key, platform, app_version)
     VALUES ($1, decode('01', 'hex'), 'ios', '1.0.0') RETURNING id`,
    [accountId],
  );
  const deviceId = device.rows[0]?.id;
  if (!deviceId) throw new Error('Device insert did not return an id');
  return { accountId, deviceId };
}

async function expectConstraintViolation(
  query: Promise<unknown>,
): Promise<void> {
  try {
    await query;
    expect.fail('Expected PostgreSQL to reject the row');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(pg.DatabaseError);
    if (error instanceof pg.DatabaseError) {
      expect(error.code).toMatch(/^23/);
    }
  }
}

describe.skipIf(databaseUrl === undefined)(
  'backend database migrations',
  () => {
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
      client = new Client({ connectionString: databaseUrl });
      await client.connect();
    });

    beforeEach(async () => {
      await client.query('BEGIN');
    });

    afterEach(async () => {
      await client.query('ROLLBACK');
    });

    afterAll(async () => {
      await client.end();
    });

    it('records migration 002 as successfully applied', async () => {
      const result = await client.query<{ name: string }>(
        `SELECT name FROM public.pgmigrations
       WHERE name = '002_create_backend_tables'`,
      );
      expect(result.rows).toEqual([{ name: '002_create_backend_tables' }]);
    });

    it('creates exactly the expected private backend tables', async () => {
      const result = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'echo' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      );
      expect(result.rows.map((row) => row.table_name)).toEqual(expectedTables);
    });

    it('enables RLS and grants no client-role table access', async () => {
      const rls = await client.query<{
        tablename: string;
        rowsecurity: boolean;
      }>(
        `SELECT tablename, rowsecurity FROM pg_tables
       WHERE schemaname = 'echo'
       ORDER BY tablename`,
      );
      const grants = await client.query<{ count: number }>(
        `SELECT count(*)::integer AS count
       FROM information_schema.role_table_grants
       WHERE table_schema = 'echo'
         AND grantee IN ('anon', 'authenticated', 'PUBLIC')`,
      );

      expect(rls.rows.map((row) => row.tablename)).toEqual(expectedTables);
      expect(rls.rows.every((row) => row.rowsecurity)).toBe(true);
      expect(grants.rows).toEqual([{ count: 0 }]);
    });

    it('rejects a device belonging to another account', async () => {
      const first = await createAccountAndDevice();
      const second = await createAccountAndDevice();
      await expectConstraintViolation(
        client.query(
          `INSERT INTO echo.sessions
           (account_id, device_id, refresh_credential_hash, expires_at)
         VALUES ($1, $2, decode('01', 'hex'), now() + interval '1 day')`,
          [second.accountId, first.deviceId],
        ),
      );
    });

    it('rejects an invalid sync revision', async () => {
      const owner = await createAccountAndDevice();
      await expectConstraintViolation(
        client.query(
          `INSERT INTO echo.sync_items
           (id, account_id, kind, revision, updated_at, ciphertext, nonce,
            algorithm, content_hash, created_by_device_id)
         VALUES (gen_random_uuid(), $1, 'entry', 0, now(), decode('01', 'hex'),
                 decode('02', 'hex'), 'A256GCM', decode('03', 'hex'), $2)`,
          [owner.accountId, owner.deviceId],
        ),
      );
    });

    it('rejects an incomplete encryption envelope', async () => {
      const owner = await createAccountAndDevice();
      await expectConstraintViolation(
        client.query(
          `INSERT INTO echo.recovery_envelopes
           (account_id, ciphertext, algorithm, content_hash)
         VALUES ($1, decode('01', 'hex'), 'A256GCM', decode('03', 'hex'))`,
          [owner.accountId],
        ),
      );
    });

    it('accepts a metadata-only tombstone', async () => {
      const owner = await createAccountAndDevice();
      const result = await client.query<{ id: string }>(
        `INSERT INTO echo.sync_items
         (id, account_id, kind, revision, updated_at, deleted_at,
          created_by_device_id)
       VALUES (gen_random_uuid(), $1, 'entry', 2, now(), now(), $2)
       RETURNING id`,
        [owner.accountId, owner.deviceId],
      );
      expect(result.rows[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('creates one account when the same identity authenticates concurrently', async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
      const database = createPostgresDependency(databaseUrl);
      const subject = `race-${randomUUID()}`;
      const identity = { provider: 'google' as const, subject };
      try {
        const accounts = await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            database.createSession(
              identity,
              Buffer.from(`refresh-${String(index)}`),
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            ),
          ),
        );
        expect(new Set(accounts.map((account) => account.id)).size).toBe(1);
        const rows = await client.query<{
          accounts: number;
          identities: number;
        }>(
          `SELECT
             count(DISTINCT a.id)::integer AS accounts,
             count(DISTINCT i.id)::integer AS identities
           FROM echo.accounts a
           JOIN echo.auth_identities i ON i.account_id = a.id
          WHERE i.provider = 'google' AND i.provider_subject = $1`,
          [subject],
        );
        expect(rows.rows).toEqual([{ accounts: 1, identities: 1 }]);
      } finally {
        await database.close();
      }
    });

    it('declares reversible migration sections without executing them', async () => {
      const migrationPath = fileURLToPath(
        new URL('../migrations/002_create_backend_tables.sql', import.meta.url),
      );
      const migration = await readFile(migrationPath, 'utf8');
      const [up, down] = migration.split(/^-- Down Migration\s*$/m);
      if (!up || !down)
        throw new Error('Migration must have up and down sections');

      expect(up).toContain('CREATE TABLE echo.accounts');
      expect(up).toContain('CREATE TABLE echo.idempotency_records');
      expect(down).toContain('DROP TABLE IF EXISTS echo.idempotency_records');
      expect(down).toContain('DROP TABLE IF EXISTS echo.accounts');
    });
  },
);
