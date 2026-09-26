import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/application.js';
import type { DatabaseDependency } from '../src/database.js';
import type { ErrorEnvelope } from '../src/schemas.js';
import { SERVICE_VERSION } from '../src/version.js';

function databaseDependency(
  checkHealth: DatabaseDependency['checkHealth'] = vi
    .fn()
    .mockResolvedValue(undefined),
): DatabaseDependency {
  return {
    checkHealth,
    close: vi.fn().mockResolvedValue(undefined),
  };
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('public API', () => {
  it('reports a healthy service and database', async () => {
    const app = await buildApp({ database: databaseDependency() });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      version: SERVICE_VERSION,
      dependencies: { database: 'ok' },
    });
    expect(response.headers['x-request-id']).toMatch(uuidPattern);
  });

  it('reports a degraded service when PostgreSQL is unavailable', async () => {
    const checkHealth = vi
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    const app = await buildApp({
      database: databaseDependency(checkHealth),
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'degraded',
      version: SERVICE_VERSION,
      dependencies: { database: 'unavailable' },
    });
  });

  it('returns the public configuration contract', async () => {
    const app = await buildApp({ database: databaseDependency() });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/configuration',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      minimumSupportedClientVersion: '0.0.0',
      policyVersions: { privacy: 'pending', terms: 'pending' },
      reflectionAvailable: false,
      featureFlags: { backup: false, reflection: false },
    });
  });

  it('returns the standard error envelope for an unknown route', async () => {
    const app = await buildApp({ database: databaseDependency() });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/not-a-route',
      headers: { 'x-request-id': 'caller-controlled-value' },
    });
    const body = response.json<ErrorEnvelope>();

    expect(response.statusCode).toBe(404);
    expect(body).toEqual({
      code: 'NOT_FOUND',
      message: 'The requested route was not found.',
      retryable: false,
      requestId: response.headers['x-request-id'],
    });
    expect(body.requestId).toMatch(uuidPattern);
    expect(body.requestId).not.toBe('caller-controlled-value');
  });

  it('does not expose internal errors in the error envelope', async () => {
    const app = await buildApp({ database: databaseDependency() });
    apps.push(app);
    app.get('/test-only/failure', () => {
      throw new Error('sensitive internal detail');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-only/failure',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      retryable: true,
      requestId: response.headers['x-request-id'],
    });
    expect(response.body).not.toContain('sensitive internal detail');
  });
});
