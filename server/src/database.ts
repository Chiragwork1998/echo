import pg from 'pg';

import type { VerifiedIdentity } from './auth.js';

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

const accountColumns = `
  a.id,
  a.display_name AS "displayName",
  a.locale,
  a.timezone,
  a.created_at AS "createdAt",
  a.updated_at AS "updatedAt"`;

export function createPostgresDependency(
  connectionString: string,
): DatabaseDependency & AuthStore {
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
  };
}
