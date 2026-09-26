import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/application.js';
import type { DatabaseDependency } from '../src/database.js';
import { FakeAuthProvider, FakeAuthStore, FakeDeviceStore } from './fakes.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

function database(): DatabaseDependency {
  return {
    checkHealth: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function publicKeyFor(byte: number): string {
  return Buffer.alloc(32, byte).toString('base64');
}

const PUBLIC_KEY = publicKeyFor(7);

interface TestContext {
  app: Awaited<ReturnType<typeof buildApp>>;
  devices: FakeDeviceStore;
}

async function testApp(
  logger?: Parameters<typeof buildApp>[0]['logger'],
): Promise<TestContext> {
  const devices = new FakeDeviceStore();
  const app = await buildApp({
    database: database(),
    authProvider: new FakeAuthProvider(),
    authStore: new FakeAuthStore(),
    deviceStore: devices,
    logger: logger ?? false,
  });
  apps.push(app);
  return { app, devices };
}

async function accessToken(
  app: Awaited<ReturnType<typeof buildApp>>,
  subject: string,
): Promise<{ token: string; accountId: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/exchange',
    payload: { provider: 'google', assertion: `${subject}-assertion` },
  });
  const body = response.json<{
    accessToken: string;
    account: { id: string };
  }>();
  return { token: body.accessToken, accountId: body.account.id };
}

interface DeviceBody {
  deviceId: string;
  publicKey: string;
  platform: 'ios' | 'android';
  appVersion: string;
}

function deviceBody(overrides: Partial<DeviceBody> = {}): DeviceBody {
  return {
    deviceId: randomUUID(),
    publicKey: PUBLIC_KEY,
    platform: 'ios',
    appVersion: '1.0.0',
    ...overrides,
  };
}

async function register(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  payload: object,
  idempotencyKey: string = randomUUID(),
) {
  return app.inject({
    method: 'POST',
    url: '/v1/me/devices',
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': idempotencyKey,
    },
    payload,
  });
}

async function revoke(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  deviceId: string,
  idempotencyKey: string = randomUUID(),
) {
  return app.inject({
    method: 'DELETE',
    url: `/v1/me/devices/${deviceId}`,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': idempotencyKey,
    },
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('account device management', () => {
  it('registers a device owned by the authenticated account', async () => {
    const { app, devices } = await testApp();
    const alice = await accessToken(app, 'alice');
    const body = deviceBody();

    const response = await register(app, alice.token, body);

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      id: body.deviceId,
      platform: 'ios',
      appVersion: '1.0.0',
      revokedAt: null,
    });
    const stored = devices.devicesForAccount(alice.accountId);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe(body.deviceId);
  });

  it('requires authentication', async () => {
    const { app } = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/me/devices',
      headers: { 'idempotency-key': randomUUID() },
      payload: deviceBody(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('never accepts a client-supplied accountId', async () => {
    const { app } = await testApp();
    const alice = await accessToken(app, 'alice');

    const response = await register(app, alice.token, {
      ...deviceBody(),
      accountId: randomUUID(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires an Idempotency-Key', async () => {
    const { app } = await testApp();
    const alice = await accessToken(app, 'alice');
    const response = await app.inject({
      method: 'POST',
      url: '/v1/me/devices',
      headers: { authorization: `Bearer ${alice.token}` },
      payload: deviceBody(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  const invalidCases: [string, Record<string, unknown>, string][] = [
    ['device UUID', { deviceId: 'not-a-uuid' }, 'VALIDATION_ERROR'],
    ['platform', { platform: 'web' }, 'VALIDATION_ERROR'],
    [
      'public key encoding',
      { publicKey: 'not*base64*value' },
      'VALIDATION_ERROR',
    ],
    [
      'public key size',
      { publicKey: Buffer.alloc(16, 1).toString('base64') },
      'VALIDATION_ERROR',
    ],
    ['app version', { appVersion: 'not-a-version' }, 'VALIDATION_ERROR'],
  ];

  it.each(invalidCases)(
    'rejects an invalid %s',
    async (_label, override, code) => {
      const { app } = await testApp();
      const alice = await accessToken(app, 'alice');

      const response = await register(app, alice.token, {
        ...deviceBody(),
        ...override,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code });
    },
  );

  it('rejects an empty public key', async () => {
    const { app } = await testApp();
    const alice = await accessToken(app, 'alice');

    const response = await register(app, alice.token, {
      ...deviceBody(),
      publicKey: '',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects an oversized public key', async () => {
    const { app } = await testApp();
    const alice = await accessToken(app, 'alice');

    const response = await register(app, alice.token, {
      ...deviceBody(),
      publicKey: publicKeyFor(9).repeat(2),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects an oversized app version', async () => {
    const { app } = await testApp();
    const alice = await accessToken(app, 'alice');

    const response = await register(app, alice.token, {
      ...deviceBody(),
      appVersion: `1.0.0-${'a'.repeat(40)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects unknown request properties', async () => {
    const { app } = await testApp();
    const alice = await accessToken(app, 'alice');

    const response = await register(app, alice.token, {
      ...deviceBody(),
      unexpected: true,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects an invalid device id in the revoke path', async () => {
    const { app } = await testApp();
    const alice = await accessToken(app, 'alice');

    const response = await revoke(app, alice.token, 'not-a-uuid');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires authentication to revoke a device', async () => {
    const { app } = await testApp();

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/me/devices/${randomUUID()}`,
      headers: { 'idempotency-key': randomUUID() },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('updates metadata on repeat registration without duplicating', async () => {
    const { app, devices } = await testApp();
    const alice = await accessToken(app, 'alice');
    const body = deviceBody();

    const first = await register(app, alice.token, body);
    const second = await register(app, alice.token, {
      ...body,
      platform: 'android',
      appVersion: '2.1.0',
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      id: body.deviceId,
      platform: 'android',
      appVersion: '2.1.0',
    });
    expect(devices.devicesForAccount(alice.accountId)).toHaveLength(1);
  });

  it('replays an identical Idempotency-Key without a second effect', async () => {
    const { app, devices } = await testApp();
    const alice = await accessToken(app, 'alice');
    const body = deviceBody();
    const key = randomUUID();

    const first = await register(app, alice.token, body, key);
    const replay = await register(app, alice.token, body, key);

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toMatchObject({ id: body.deviceId });
    expect(devices.devicesForAccount(alice.accountId)).toHaveLength(1);
  });

  it('rejects a reused Idempotency-Key with a different body', async () => {
    const { app } = await testApp();
    const alice = await accessToken(app, 'alice');
    const key = randomUUID();

    await register(app, alice.token, deviceBody(), key);
    const reuse = await register(app, alice.token, deviceBody(), key);

    expect(reuse.statusCode).toBe(409);
    expect(reuse.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('revokes a device and is idempotent on repeat deletion', async () => {
    const { app, devices } = await testApp();
    const alice = await accessToken(app, 'alice');
    const body = deviceBody();
    await register(app, alice.token, body);

    const first = await revoke(app, alice.token, body.deviceId);
    const second = await revoke(app, alice.token, body.deviceId);

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    expect(devices.device(body.deviceId)?.revokedAt).not.toBeNull();
  });

  it('isolates devices across accounts and hides foreign ownership', async () => {
    const { app, devices } = await testApp();
    const alice = await accessToken(app, 'alice');
    const bob = await accessToken(app, 'bob');
    const body = deviceBody();
    await register(app, alice.token, body);

    const hijack = await register(app, bob.token, body);
    const foreignDelete = await revoke(app, bob.token, body.deviceId);

    expect(hijack.statusCode).toBe(409);
    expect(hijack.json()).toMatchObject({ code: 'DEVICE_CONFLICT' });
    // A foreign deletion is indistinguishable from success but changes nothing.
    expect(foreignDelete.statusCode).toBe(204);
    expect(devices.devicesForAccount(alice.accountId)).toHaveLength(1);
    expect(devices.device(body.deviceId)?.revokedAt).toBeNull();
  });

  it('revokes related sessions for the authenticated account only', async () => {
    const { app, devices } = await testApp();
    const alice = await accessToken(app, 'alice');
    const bob = await accessToken(app, 'bob');
    const aliceDevice = deviceBody();
    const bobDevice = deviceBody();
    await register(app, alice.token, aliceDevice);
    await register(app, bob.token, bobDevice);
    devices.addSession('alice-session', alice.accountId, aliceDevice.deviceId);
    devices.addSession('bob-session', bob.accountId, bobDevice.deviceId);

    // A foreign deletion is a no-op and must not revoke the owner's sessions.
    const foreign = await revoke(app, bob.token, aliceDevice.deviceId);
    expect(foreign.statusCode).toBe(204);
    expect(devices.session('alice-session')?.revokedAt).toBeNull();

    const revoked = await revoke(app, alice.token, aliceDevice.deviceId);
    expect(revoked.statusCode).toBe(204);
    expect(devices.session('alice-session')?.revokedAt).not.toBeNull();
    expect(devices.session('bob-session')?.revokedAt).toBeNull();
  });

  it('does not log public keys, credentials, or request bodies', async () => {
    let logs = '';
    const stream = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        logs += String(chunk);
        callback();
      },
    });
    const { app } = await testApp({ level: 'info', stream });
    const alice = await accessToken(app, 'alice');
    const secretKey = randomBytes(32).toString('base64');
    const body = deviceBody({ publicKey: secretKey });

    await register(app, alice.token, body);
    await revoke(app, alice.token, body.deviceId);

    expect(logs).toContain('request.completed');
    expect(logs).not.toContain(secretKey);
    expect(logs).not.toContain(alice.token);
    expect(logs).not.toContain('publicKey');
  });
});
