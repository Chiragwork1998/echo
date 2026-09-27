import pg from 'pg';

import type { VerifiedIdentity } from './auth.js';
import {
  DeviceConflictError,
  IdempotencyInProgressError,
  IdempotencyKeyReusedError,
} from './errors.js';

const { Pool } = pg;

export interface DatabaseDependency {
  checkHealth(): Promise<void>;
  close(): Promise<void>;
}

export interface AccountRecord {
  id: string;
  displayName: string | null;
  locale: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilePatch {
  displayName?: string | null;
  locale?: string;
  timezone?: string;
}

export interface AuthStore {
  createSession(
    identity: VerifiedIdentity,
    refreshCredentialHash: Buffer,
    expiresAt: Date,
  ): Promise<AccountRecord>;
  rotateSession(
    identity: VerifiedIdentity,
    previousHash: Buffer,
    nextHash: Buffer,
    expiresAt: Date,
  ): Promise<AccountRecord | null>;
  revokeSession(accountId: string, refreshHash: Buffer): Promise<boolean>;
  findAccount(identity: VerifiedIdentity): Promise<AccountRecord | null>;
  updateAccount(accountId: string, patch: ProfilePatch): Promise<AccountRecord>;
}

export type DevicePlatform = 'ios' | 'android';

export interface DeviceRegistration {
  deviceId: string;
  publicKey: Buffer;
  platform: DevicePlatform;
  appVersion: string;
}

export interface DeviceRecord {
  id: string;
  platform: DevicePlatform;
  appVersion: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface RegisterDeviceInput {
  accountId: string;
  registration: DeviceRegistration;
  idempotencyKey: string;
  requestHash: Buffer;
}

export interface RegisterDeviceResult {
  device: DeviceRecord;
  status: 200 | 201;
  replayed: boolean;
}

export interface RevokeDeviceInput {
  accountId: string;
  deviceId: string;
  idempotencyKey: string;
  requestHash: Buffer;
}

export interface RevokeDeviceResult {
  replayed: boolean;
}

/**
 * Device registration is always account-scoped. Callers may only pass the
 * account id derived from the authenticated identity.
 */
export interface DeviceStore {
  registerDevice(input: RegisterDeviceInput): Promise<RegisterDeviceResult>;
  revokeDevice(input: RevokeDeviceInput): Promise<RevokeDeviceResult>;
}

const accountColumns = `
  a.id,
  a.display_name AS "displayName",
  a.locale,
  a.timezone,
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt"`;

export function createPostgresDependency(
  connectionString: string,
): DatabaseDependency & AuthStore & DeviceStore {
  const pool = new Pool({
    connectionString,
    // Keep each autoscaled Vercel instance from exhausting the Supabase pool.
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  return {
    async checkHealth() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
    async createSession(identity, refreshCredentialHash, expiresAt) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let result = await client.query<AccountRecord>(
          `SELECT ${accountColumns}
             FROM echo.accounts a
             JOIN echo.auth_identities i ON i.account_id = a.id
            WHERE i.provider = $1 AND i.provider_subject = $2
              AND a.status = 'active'
            FOR UPDATE OF a`,
          [identity.provider, identity.subject],
        );
        if (!result.rows[0]) {
          const created = await client.query<AccountRecord>(
            `INSERT INTO echo.accounts DEFAULT VALUES
             RETURNING id, display_name AS "displayName", locale, timezone,
                       created_at AS "createdAt", updated_at AS "updatedAt"`,
          );
          const candidate = created.rows[0];
          if (!candidate) throw new Error('Account creation failed');
          const identityInsert = await client.query<{ accountId: string }>(
            `INSERT INTO echo.auth_identities
               (account_id, provider, provider_subject, last_authenticated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (provider, provider_subject) DO NOTHING
             RETURNING account_id AS "accountId"`,
            [candidate.id, identity.provider, identity.subject],
          );
          if (identityInsert.rows[0]) {
            result = created;
          } else {
            // A concurrent request won the identity insert. Remove this
            // transaction's orphan candidate and lock/read the winner.
            await client.query('DELETE FROM echo.accounts WHERE id = $1', [
              candidate.id,
            ]);
            result = await client.query<AccountRecord>(
              `SELECT ${accountColumns}
                 FROM echo.accounts a
                 JOIN echo.auth_identities i ON i.account_id = a.id
                WHERE i.provider = $1 AND i.provider_subject = $2
                  AND a.status = 'active'
                FOR UPDATE OF a`,
              [identity.provider, identity.subject],
            );
            if (!result.rows[0]) throw new Error('Account lookup failed');
            await client.query(
              `UPDATE echo.auth_identities SET last_authenticated_at = now()
                WHERE account_id = $1 AND provider = $2 AND provider_subject = $3`,
              [result.rows[0].id, identity.provider, identity.subject],
            );
          }
        } else {
          await client.query(
            `UPDATE echo.auth_identities SET last_authenticated_at = now()
             WHERE account_id = $1 AND provider = $2 AND provider_subject = $3`,
            [result.rows[0].id, identity.provider, identity.subject],
          );
        }
        const account = result.rows[0];
        if (!account) throw new Error('Account lookup failed');
        await client.query(
          `INSERT INTO echo.sessions
             (account_id, refresh_credential_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [account.id, refreshCredentialHash, expiresAt],
        );
        await client.query('COMMIT');
        return account;
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async rotateSession(identity, previousHash, nextHash, expiresAt) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<AccountRecord>(
          `SELECT ${accountColumns}
             FROM echo.sessions s
             JOIN echo.accounts a ON a.id = s.account_id
             JOIN echo.auth_identities i ON i.account_id = a.id
            WHERE s.refresh_credential_hash = $1
              AND s.revoked_at IS NULL AND s.expires_at > now()
              AND i.provider = $2 AND i.provider_subject = $3
              AND a.status = 'active'
            FOR UPDATE OF s`,
          [previousHash, identity.provider, identity.subject],
        );
        const account = result.rows[0];
        if (!account) {
          await client.query('ROLLBACK');
          return null;
        }
        await client.query(
          `UPDATE echo.sessions
              SET rotated_at = now(), revoked_at = now()
            WHERE account_id = $1 AND refresh_credential_hash = $2
              AND revoked_at IS NULL`,
          [account.id, previousHash],
        );
        await client.query(
          `INSERT INTO echo.sessions
             (account_id, refresh_credential_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [account.id, nextHash, expiresAt],
        );
        await client.query('COMMIT');
        return account;
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async revokeSession(accountId, refreshHash) {
      const result = await pool.query(
        `UPDATE echo.sessions SET revoked_at = now()
          WHERE account_id = $1 AND refresh_credential_hash = $2
            AND revoked_at IS NULL`,
        [accountId, refreshHash],
      );
      return (result.rowCount ?? 0) > 0;
    },
    async findAccount(identity) {
      const result = await pool.query<AccountRecord>(
        `SELECT ${accountColumns}
           FROM echo.accounts a
           JOIN echo.auth_identities i ON i.account_id = a.id
          WHERE i.provider = $1 AND i.provider_subject = $2
            AND a.status = 'active'`,
        [identity.provider, identity.subject],
      );
      return result.rows[0] ?? null;
    },
    async updateAccount(accountId, patch) {
      const result = await pool.query<AccountRecord>(
        `UPDATE echo.accounts a
            SET display_name = CASE WHEN $2 THEN $3 ELSE display_name END,
                locale = CASE WHEN $4 THEN $5 ELSE locale END,
                timezone = CASE WHEN $6 THEN $7 ELSE timezone END,
                updated_at = now()
          WHERE id = $1 AND status = 'active'
          RETURNING id, display_name AS "displayName", locale, timezone,
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          accountId,
          'displayName' in patch,
          patch.displayName ?? null,
          'locale' in patch,
          patch.locale ?? '',
          'timezone' in patch,
          patch.timezone ?? '',
        ],
      );
      const account = result.rows[0];
      if (!account) throw new Error('Account update failed');
      return account;
    },
    async registerDevice({
      accountId,
      registration,
      idempotencyKey,
      requestHash,
    }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const begun = await client.query(
          `INSERT INTO echo.idempotency_records
             (account_id, scope, idempotency_key, request_hash, state, expires_at)
           VALUES ($1, 'device.register', $2, $3, 'processing', now() + interval '1 day')
           ON CONFLICT (account_id, scope, idempotency_key) DO NOTHING
           RETURNING id`,
          [accountId, idempotencyKey, requestHash],
        );
        if ((begun.rowCount ?? 0) === 0) {
          const existing = await client.query<{
            requestHash: Buffer;
            state: string;
            responseStatus: number | null;
            resourceId: string | null;
          }>(
            `SELECT request_hash AS "requestHash", state,
                    response_status AS "responseStatus",
                    resource_id AS "resourceId"
               FROM echo.idempotency_records
              WHERE account_id = $1 AND scope = 'device.register'
                AND idempotency_key = $2
              FOR UPDATE`,
            [accountId, idempotencyKey],
          );
          const record = existing.rows[0];
          if (!record) throw new IdempotencyInProgressError();
          if (!record.requestHash.equals(requestHash)) {
            throw new IdempotencyKeyReusedError();
          }
          if (
            record.state !== 'complete' ||
            record.responseStatus === null ||
            record.resourceId === null
          ) {
            throw new IdempotencyInProgressError();
          }
          const replay = await client.query<DeviceRecord>(
            `SELECT id, platform, app_version AS "appVersion",
                    created_at AS "createdAt",
                    last_seen_at AS "lastSeenAt",
                    revoked_at AS "revokedAt"
               FROM echo.devices
              WHERE account_id = $1 AND id = $2`,
            [accountId, record.resourceId],
          );
          const device = replay.rows[0];
          if (!device) throw new Error('Idempotent device replay failed');
          await client.query('COMMIT');
          return {
            device,
            status: record.responseStatus === 201 ? 201 : 200,
            replayed: true,
          };
        }

        const upsert = await client.query<DeviceRecord & { created: boolean }>(
          `INSERT INTO echo.devices AS d
             (id, account_id, public_key, platform, app_version)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE
              SET public_key = EXCLUDED.public_key,
                  platform = EXCLUDED.platform,
                  app_version = EXCLUDED.app_version,
                  last_seen_at = now(),
                  revoked_at = NULL
            WHERE d.account_id = EXCLUDED.account_id
           RETURNING id, platform, app_version AS "appVersion",
                     created_at AS "createdAt",
                     last_seen_at AS "lastSeenAt",
                     revoked_at AS "revokedAt",
                     (xmax = 0) AS created`,
          [
            registration.deviceId,
            accountId,
            registration.publicKey,
            registration.platform,
            registration.appVersion,
          ],
        );
        const row = upsert.rows[0];
        if (!row) {
          throw new DeviceConflictError();
        }
        const status = row.created ? 201 : 200;
        await client.query(
          `UPDATE echo.idempotency_records
              SET state = 'complete', response_status = $4, resource_id = $5
            WHERE account_id = $1 AND scope = 'device.register'
              AND idempotency_key = $2 AND request_hash = $3`,
          [accountId, idempotencyKey, requestHash, status, row.id],
        );
        await client.query('COMMIT');
        return {
          device: {
            id: row.id,
            platform: row.platform,
            appVersion: row.appVersion,
            createdAt: row.createdAt,
            lastSeenAt: row.lastSeenAt,
            revokedAt: row.revokedAt,
          },
          status,
          replayed: false,
        };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async revokeDevice({ accountId, deviceId, idempotencyKey, requestHash }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const begun = await client.query(
          `INSERT INTO echo.idempotency_records
             (account_id, scope, idempotency_key, request_hash, state, expires_at)
           VALUES ($1, 'device.revoke', $2, $3, 'processing', now() + interval '1 day')
           ON CONFLICT (account_id, scope, idempotency_key) DO NOTHING
           RETURNING id`,
          [accountId, idempotencyKey, requestHash],
        );
        if ((begun.rowCount ?? 0) === 0) {
          const existing = await client.query<{
            requestHash: Buffer;
            state: string;
          }>(
            `SELECT request_hash AS "requestHash", state
               FROM echo.idempotency_records
              WHERE account_id = $1 AND scope = 'device.revoke'
                AND idempotency_key = $2
              FOR UPDATE`,
            [accountId, idempotencyKey],
          );
          const record = existing.rows[0];
          if (!record) throw new IdempotencyInProgressError();
          if (!record.requestHash.equals(requestHash)) {
            throw new IdempotencyKeyReusedError();
          }
          if (record.state !== 'complete') {
            throw new IdempotencyInProgressError();
          }
          await client.query('COMMIT');
          return { replayed: true };
        }

        // Account-scoped and idempotent: a foreign or unknown device affects
        // zero rows and is never distinguished from an already-revoked device.
        await client.query(
          `UPDATE echo.sessions SET revoked_at = now()
            WHERE account_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
          [accountId, deviceId],
        );
        await client.query(
          `UPDATE echo.devices SET revoked_at = now(), last_seen_at = now()
            WHERE account_id = $1 AND id = $2 AND revoked_at IS NULL`,
          [accountId, deviceId],
        );
        await client.query(
          `UPDATE echo.idempotency_records
              SET state = 'complete', response_status = 204, resource_id = $4
            WHERE account_id = $1 AND scope = 'device.revoke'
              AND idempotency_key = $2 AND request_hash = $3`,
          [accountId, idempotencyKey, requestHash, deviceId],
        );
        await client.query('COMMIT');
        return { replayed: false };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
