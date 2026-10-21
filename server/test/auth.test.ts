import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/application.js';
import type { DatabaseDependency } from '../src/database.js';
import { FakeAuthProvider, FakeAuthStore } from './fakes.js';
import { REFRESH_SESSION_LIFETIME_SECONDS } from '../src/config.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

function database(): DatabaseDependency {
  return {
    checkHealth: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

async function testApp(
  logger: Parameters<typeof buildApp>[0]['logger'] = false,
) {
  const authStore = new FakeAuthStore();
  const app = await buildApp({
    database: database(),
    authProvider: new FakeAuthProvider(),
    authStore,
    logger,
  });
  apps.push(app);
  return { app, authStore };
}

async function exchange(
  app: Awaited<ReturnType<typeof buildApp>>,
  subject: string,
) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/exchange',
    payload: { provider: 'google', assertion: `${subject}-assertion` },
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('authentication and account API', () => {
  it('authenticates and returns the current account', async () => {
    const { app } = await testApp();
    const auth = await exchange(app, 'alice');
    const credentials = auth.json<{
      accessToken: string;
      account: { id: string };
    }>();

    expect(auth.statusCode).toBe(200);
    expect(auth.headers['cache-control']).toBe('no-store');
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${credentials.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ id: string }>().id).toBe(credentials.account.id);
  });

  it('returns a generic error for invalid credentials', async () => {
    const { app } = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/exchange',
      payload: { provider: 'google', assertion: 'invalid-provider-secret' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Authentication failed.',
    });
    expect(response.body).not.toContain('invalid-provider-secret');
  });

  it('rotates refresh credentials and rejects reuse', async () => {
    const { app } = await testApp();
    const initial = (await exchange(app, 'alice')).json<{
      refreshToken: string;
    }>();
    const refreshed = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: initial.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<{ refreshToken: string }>().refreshToken).not.toBe(
      initial.refreshToken,
    );
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: initial.refreshToken },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('logs out and revokes the refresh credential', async () => {
    const { app } = await testApp();
    const credentials = (await exchange(app, 'alice')).json<{
      accessToken: string;
      refreshToken: string;
    }>();
    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${credentials.accessToken}` },
      payload: { refreshToken: credentials.refreshToken },
    });
    expect(logout.statusCode).toBe(200);
    const refresh = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: credentials.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('enforces account isolation during logout', async () => {
    const { app } = await testApp();
    const alice = (await exchange(app, 'alice')).json<{
      accessToken: string;
      refreshToken: string;
    }>();
    const bob = (await exchange(app, 'bob')).json<{
      refreshToken: string;
    }>();
    const crossAccount = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${alice.accessToken}` },
      payload: { refreshToken: bob.refreshToken },
    });
    expect(crossAccount.statusCode).toBe(401);
    const bobRefresh = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: bob.refreshToken },
    });
    expect(bobRefresh.statusCode).toBe(200);
  });

  it('allowlists mutable profile fields', async () => {
    const { app } = await testApp();
    const credentials = (await exchange(app, 'alice')).json<{
      accessToken: string;
    }>();
    const headers = { authorization: `Bearer ${credentials.accessToken}` };
    const rejected = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers,
      payload: { displayName: 'Alice', status: 'deleted' },
    });
    expect(rejected.statusCode).toBe(400);
    const accepted = await app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers,
      payload: {
        displayName: 'Alice',
        locale: 'en-IN',
        timezone: 'Asia/Kolkata',
      },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      displayName: 'Alice',
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
    });
  });

  it('does not write credentials to logs', async () => {
    let logs = '';
    const stream = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        logs += String(chunk);
        callback();
      },
    });
    const { app } = await testApp({ level: 'info', stream });
    const assertion = 'private-assertion';
    const response = await exchange(app, 'private');
    const credentials = response.json<{
      accessToken: string;
      refreshToken: string;
    }>();
    await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${credentials.accessToken}` },
    });
    expect(logs).not.toContain(assertion);
    expect(logs).not.toContain(credentials.accessToken);
    expect(logs).not.toContain(credentials.refreshToken);
  });

  it('stores refresh sessions for 30 days independently of access expiry', async () => {
    const before = Date.now();
    const { app, authStore } = await testApp();
    await exchange(app, 'alice');
    const expiry = authStore.sessionExpiries[0];
    if (!expiry) throw new Error('Expected a refresh-session expiry');
    const expected = REFRESH_SESSION_LIFETIME_SECONDS * 1000;
    expect(expiry.getTime() - before).toBeGreaterThanOrEqual(expected - 1000);
    expect(expiry.getTime() - before).toBeLessThanOrEqual(expected + 1000);
  });
});
