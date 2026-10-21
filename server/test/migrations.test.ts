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
  'operational_audit_events',
  'rate_limit_buckets',
  'recovery_envelopes',
  'reflection_jobs',
  'sessions',
  'stored_objects',
  'sync_cursors',
  'sync_item_revisions',
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
  query: () => Promise<unknown>,
): Promise<void> {
  await client.query('SAVEPOINT expected_constraint_violation');
  try {
    await query();
    await client.query('ROLLBACK TO SAVEPOINT expected_constraint_violation');
    expect.fail('Expected PostgreSQL to reject the row');
  } catch (error: unknown) {
    await client.query('ROLLBACK TO SAVEPOINT expected_constraint_violation');
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

    it('has valid foreign keys, checks, triggers, and indexes on every table', async () => {
      const invalidConstraints = await client.query<{ count: number }>(
        `SELECT count(*)::integer AS count
           FROM pg_constraint
          WHERE connamespace = 'echo'::regnamespace AND NOT convalidated`,
      );
      const tablesWithoutIndexes = await client.query<{ table_name: string }>(
        `SELECT t.tablename AS table_name
           FROM pg_tables t
          WHERE t.schemaname = 'echo'
            AND NOT EXISTS (
              SELECT 1 FROM pg_indexes i
              WHERE i.schemaname = t.schemaname AND i.tablename = t.tablename
            )
          ORDER BY t.tablename`,
      );
      const invalidIndexes = await client.query<{ count: number }>(
        `SELECT count(*)::integer AS count
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'echo' AND NOT i.indisvalid`,
      );
      const expectedIndexes = await client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'echo' AND indexname IN (
            'sync_items_cursor_idx',
            'sync_items_tombstone_cleanup_idx',
            'sync_item_revisions_conflict_idx',
            'sync_item_revisions_cleanup_idx',
            'sessions_expiry_cleanup_idx',
            'export_jobs_worker_idx',
            'export_jobs_expiry_cleanup_idx',
            'reflection_jobs_expiry_cleanup_idx',
            'rate_limit_buckets_cleanup_idx',
            'operational_audit_events_cleanup_idx'
          ) ORDER BY indexname`,
      );

      expect(invalidConstraints.rows).toEqual([{ count: 0 }]);
      expect(tablesWithoutIndexes.rows).toEqual([]);
      expect(invalidIndexes.rows).toEqual([{ count: 0 }]);
      expect(expectedIndexes.rows).toHaveLength(10);
    });

    it('keeps every account-scoped relationship within its owner account', async () => {
      const unsafe = await client.query<{ conname: string }>(
        `SELECT c.conname
           FROM pg_constraint c
           JOIN pg_class source ON source.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = source.relnamespace
          WHERE n.nspname = 'echo' AND c.contype = 'f'
            AND EXISTS (
              SELECT 1 FROM unnest(c.conkey) key(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
              WHERE a.attname <> 'account_id'
            )
            AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.conrelid AND a.attname = 'account_id'
            )
            AND NOT EXISTS (
              SELECT 1 FROM unnest(c.conkey) key(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
              WHERE a.attname = 'account_id'
            )`,
      );
      expect(unsafe.rows).toEqual([]);
    });

    it('rejects a device belonging to another account', async () => {
      const first = await createAccountAndDevice();
      const second = await createAccountAndDevice();
      await expectConstraintViolation(() =>
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
      await expectConstraintViolation(() =>
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
      await expectConstraintViolation(() =>
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

    it('enforces monotonic revisions and archives encrypted history', async () => {
      const owner = await createAccountAndDevice();
      const inserted = await client.query<{
        id: string;
        change_sequence: string;
      }>(
        `INSERT INTO echo.sync_items
           (id, account_id, kind, revision, updated_at, ciphertext, nonce,
            algorithm, content_hash, created_by_device_id)
         VALUES (gen_random_uuid(), $1, 'entry', 1, now(), decode('01','hex'),
                 decode('02','hex'), 'A256GCM', decode('03','hex'), $2)
         RETURNING id, change_sequence`,
        [owner.accountId, owner.deviceId],
      );
      const item = inserted.rows[0];
      if (!item) throw new Error('Sync item insert failed');

      await expectConstraintViolation(() =>
        client.query(
          `UPDATE echo.sync_items SET revision = 1, updated_at = now()
            WHERE account_id = $1 AND id = $2`,
          [owner.accountId, item.id],
        ),
      );

      const updated = await client.query<{ change_sequence: string }>(
        `UPDATE echo.sync_items
            SET revision = 2, updated_at = now(), ciphertext = decode('04','hex'),
                nonce = decode('05','hex'), content_hash = decode('06','hex')
          WHERE account_id = $1 AND id = $2
          RETURNING change_sequence`,
        [owner.accountId, item.id],
      );
      const history = await client.query<{ revision: string }>(
        `SELECT revision FROM echo.sync_item_revisions
          WHERE account_id = $1 AND sync_item_id = $2`,
        [owner.accountId, item.id],
      );
      expect(BigInt(updated.rows[0]?.change_sequence ?? 0)).toBeGreaterThan(
        BigInt(item.change_sequence),
      );
      expect(history.rows).toEqual([{ revision: '1' }]);
    });

    it('orders sync changes deterministically by cursor sequence and id', async () => {
      const owner = await createAccountAndDevice();
      await client.query(
        `INSERT INTO echo.sync_items
           (id, account_id, kind, revision, updated_at, ciphertext, nonce,
            algorithm, content_hash, created_by_device_id)
         VALUES
           ('00000000-0000-4000-8000-000000000002', $1, 'settings', 1, now(), decode('01','hex'), decode('02','hex'), 'A256GCM', decode('03','hex'), $2),
           ('00000000-0000-4000-8000-000000000001', $1, 'profile', 1, now(), decode('04','hex'), decode('05','hex'), 'A256GCM', decode('06','hex'), $2)`,
        [owner.accountId, owner.deviceId],
      );
      const result = await client.query<{
        id: string;
        change_sequence: string;
      }>(
        `SELECT id, change_sequence FROM echo.sync_items
          WHERE account_id = $1
          ORDER BY change_sequence, id`,
        [owner.accountId],
      );
      expect(result.rows).toHaveLength(2);
      expect(BigInt(result.rows[1]?.change_sequence ?? 0)).toBeGreaterThan(
        BigInt(result.rows[0]?.change_sequence ?? 0),
      );
    });

    it('prevents refresh-hash reuse and supports session revocation and expiry', async () => {
      const owner = await createAccountAndDevice();
      await client.query(
        `INSERT INTO echo.sessions
           (account_id, device_id, refresh_credential_hash, expires_at, revoked_at)
         VALUES ($1, $2, decode('a1','hex'), now() + interval '1 day', now())`,
        [owner.accountId, owner.deviceId],
      );
      await expectConstraintViolation(() =>
        client.query(
          `INSERT INTO echo.sessions
             (account_id, refresh_credential_hash, expires_at)
           VALUES ($1, decode('a1','hex'), now() + interval '1 day')`,
          [owner.accountId],
        ),
      );
    });

    it('preserves immutable consent history', async () => {
      const owner = await createAccountAndDevice();
      const consent = await client.query<{ id: string }>(
        `INSERT INTO echo.consent_records
           (account_id, consent_type, policy_version, granted)
         VALUES ($1, 'privacy', 'v1', true) RETURNING id`,
        [owner.accountId],
      );
      await expectConstraintViolation(() =>
        client.query(
          `UPDATE echo.consent_records SET policy_version = 'v2'
            WHERE account_id = $1 AND id = $2`,
          [owner.accountId, consent.rows[0]?.id],
        ),
      );
      await client.query(
        `INSERT INTO echo.consent_records
           (account_id, consent_type, policy_version, granted, revoked_at)
         VALUES ($1, 'privacy', 'v2', false, now())`,
        [owner.accountId],
      );
      const history = await client.query<{ policy_version: string }>(
        `SELECT policy_version FROM echo.consent_records
          WHERE account_id = $1 AND consent_type = 'privacy'
          ORDER BY recorded_at, id`,
        [owner.accountId],
      );
      expect(history.rows).toHaveLength(2);
    });

    it('enforces job state integrity', async () => {
      const owner = await createAccountAndDevice();
      await expectConstraintViolation(() =>
        client.query(
          `INSERT INTO echo.deletion_jobs (account_id, status)
           VALUES ($1, 'processing')`,
          [owner.accountId],
        ),
      );
      await expectConstraintViolation(() =>
        client.query(
          `INSERT INTO echo.export_jobs (account_id, status)
           VALUES ($1, 'complete')`,
          [owner.accountId],
        ),
      );
    });

    it('enforces idempotency uniqueness and supports cleanup persistence', async () => {
      const owner = await createAccountAndDevice();
      await client.query(
        `INSERT INTO echo.idempotency_records
           (account_id, scope, idempotency_key, request_hash, expires_at)
         VALUES ($1, 'sync', 'same-key', decode('01','hex'), now() + interval '1 day')`,
        [owner.accountId],
      );
      await expectConstraintViolation(() =>
        client.query(
          `INSERT INTO echo.idempotency_records
             (account_id, scope, idempotency_key, request_hash, expires_at)
           VALUES ($1, 'sync', 'same-key', decode('02','hex'), now() + interval '1 day')`,
          [owner.accountId],
        ),
      );
      await client.query(
        `INSERT INTO echo.rate_limit_buckets
           (account_id, scope, subject_hash, window_start, expires_at)
         VALUES ($1, 'sync', decode('03','hex'), now(), now() + interval '1 hour')`,
        [owner.accountId],
      );
      await client.query(
        `INSERT INTO echo.operational_audit_events
           (account_id, event_type, outcome, expires_at)
         VALUES ($1, 'sync.push', 'succeeded', now() + interval '30 days')`,
        [owner.accountId],
      );
    });

    it('revokes function execution from client roles', async () => {
      const privileges = await client.query<{
        public_execute: boolean;
        anon_execute: boolean;
        authenticated_execute: boolean;
      }>(
        `SELECT
           has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
           CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
             THEN has_function_privilege('anon', p.oid, 'EXECUTE') ELSE false END AS anon_execute,
           CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
             THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') ELSE false END AS authenticated_execute
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='echo'`,
      );
      expect(privileges.rows.length).toBeGreaterThan(0);
      expect(
        privileges.rows.every(
          (row) =>
            !row.public_execute &&
            !row.anon_execute &&
            !row.authenticated_execute,
        ),
      ).toBe(true);
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
