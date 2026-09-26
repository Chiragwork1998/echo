import 'dotenv/config';

import pg from 'pg';

import { buildApp } from '../src/application.js';
import { createPostgresDependency } from '../src/database.js';
import { SupabaseAuthProvider } from '../src/supabase-auth.js';

const { Client } = pg;

function required(name: string, fallbackName?: string): string {
  const value =
    process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function assertStatus(actual: number, expected: number, step: string): void {
  if (actual !== expected)
    throw new Error(`${step} failed with HTTP ${String(actual)}`);
}

const databaseUrl = required('DATABASE_URL');
const supabaseUrl = required('SUPABASE_URL');
const authApiKey = required('SUPABASE_AUTH_API_KEY');
const serviceRoleKey = required(
  'SUPABASE_SERVICE_ROLE_KEY',
  'Supabase_service_role',
);
const email = `echo-live-${String(Date.now())}@example.invalid`;

let authUserId: string | undefined;
const database = createPostgresDependency(databaseUrl);
const app = await buildApp({
  database,
  authStore: database,
  authProvider: new SupabaseAuthProvider(supabaseUrl, authApiKey),
});

try {
  const generated = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  assertStatus(generated.status, 200, 'Generate magic link');
  const generatedBody = (await generated.json()) as {
    hashed_token?: unknown;
    id?: unknown;
  };
  if (
    typeof generatedBody.hashed_token !== 'string' ||
    typeof generatedBody.id !== 'string'
  )
    throw new Error(
      `Generate magic link returned unexpected fields: ${Object.keys(generatedBody).join(',')}`,
    );
  authUserId = generatedBody.id;

  const verified = await app.inject({
    method: 'POST',
    url: '/v1/auth/magic-link/verify',
    payload: { tokenHash: generatedBody.hashed_token },
  });
  assertStatus(verified.statusCode, 200, 'Verify magic link callback');
  if (verified.headers['cache-control'] !== 'no-store')
    throw new Error('Credential response was cacheable');
  const initial = verified.json<{
    accessToken: string;
    refreshToken: string;
  }>();

  const me = await app.inject({
    method: 'GET',
    url: '/v1/me',
    headers: { authorization: `Bearer ${initial.accessToken}` },
  });
  assertStatus(me.statusCode, 200, 'Validate Supabase JWT through Fastify');

  const refreshed = await app.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: { refreshToken: initial.refreshToken },
  });
  assertStatus(refreshed.statusCode, 200, 'Rotate refresh credential');
  const rotated = refreshed.json<{
    accessToken: string;
    refreshToken: string;
  }>();
  if (rotated.refreshToken === initial.refreshToken)
    throw new Error('Refresh credential did not rotate');

  const replay = await app.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: { refreshToken: initial.refreshToken },
  });
  assertStatus(replay.statusCode, 401, 'Reject refresh credential replay');

  const logout = await app.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    headers: { authorization: `Bearer ${rotated.accessToken}` },
    payload: { refreshToken: rotated.refreshToken },
  });
  assertStatus(logout.statusCode, 200, 'Logout');

  const afterLogout = await app.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    payload: { refreshToken: rotated.refreshToken },
  });
  assertStatus(afterLogout.statusCode, 401, 'Reject refresh after logout');

  process.stdout.write(
    'Live auth smoke passed: callback, JWT, hosted persistence, rotation, replay rejection, logout.\n',
  );
} finally {
  await app.close();
  if (authUserId) {
    const cleanup = new Client({ connectionString: databaseUrl });
    await cleanup.connect();
    try {
      await cleanup.query(
        `DELETE FROM echo.accounts
          WHERE id IN (
            SELECT account_id FROM echo.auth_identities
            WHERE provider = 'email' AND provider_subject = $1
          )`,
        [authUserId],
      );
    } finally {
      await cleanup.end();
    }
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${authUserId}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });
  }
}
