import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import handler from '../api/index.js';
import { createPostgresDependency } from '../src/database.js';

vi.mock('../src/database.js', () => ({
  createPostgresDependency: vi.fn(() => ({
    checkHealth: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  })),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/echo_vercel_test');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_AUTH_API_KEY', 'test-publishable-key-only');
  vi.stubEnv('SARVAM_VOICE_API', 'test-transcription-key-only');
  vi.stubEnv('LOG_LEVEL', 'silent');
  server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      response.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});

it('serves health through the serverless handler without a Fastify listener', async () => {
  const response = await fetch(`${baseUrl}/v1/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: 'ok',
    dependencies: { database: 'ok' },
  });
  expect(response.headers.get('x-request-id')).toBeTruthy();
  expect(createPostgresDependency).toHaveBeenCalledTimes(1);
});

it('reuses the initialized app and pool across serverless requests', async () => {
  const initializations = vi.mocked(createPostgresDependency).mock.calls.length;
  const responses = await Promise.all([
    fetch(`${baseUrl}/v1/configuration`),
    fetch(`${baseUrl}/v1/configuration`),
  ]);
  expect(responses.every((response) => response.status === 200)).toBe(true);
  expect(createPostgresDependency).toHaveBeenCalledTimes(initializations);
});

it('keeps account routes protected on the public production API', async () => {
  const response = await fetch(`${baseUrl}/v1/me`);
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
});
