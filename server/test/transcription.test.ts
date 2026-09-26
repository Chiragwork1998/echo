import { access } from 'node:fs/promises';
import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/application.js';
import type { DatabaseDependency } from '../src/database.js';
import {
  AccountRateLimiter,
  TranscriptionProviderError,
  type TranscriptionProvider,
} from '../src/transcription.js';
import { FakeAuthProvider, FakeAuthStore } from './fakes.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

function wav(): Buffer {
  const dataSize = 1600;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function multipart(
  content: Buffer,
  filename = 'voice.wav',
  mimetype = 'audio/wav',
  fieldname = 'audio',
): { payload: Buffer; contentType: string } {
  const boundary = 'echo-test-boundary';
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldname}"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

async function setup(
  provider: TranscriptionProvider,
  options: {
    logger?: Parameters<typeof buildApp>[0]['logger'];
    maxBytes?: number;
    limiter?: AccountRateLimiter;
  } = {},
) {
  const database: DatabaseDependency = {
    checkHealth: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const app = await buildApp({
    database,
    authProvider: new FakeAuthProvider(),
    authStore: new FakeAuthStore(),
    transcriptionProvider: provider,
    ...(options.maxBytes === undefined
      ? {}
      : { transcriptionMaxBytes: options.maxBytes }),
    ...(options.limiter === undefined
      ? {}
      : { transcriptionRateLimiter: options.limiter }),
    logger: options.logger ?? false,
  });
  apps.push(app);
  const auth = await app.inject({
    method: 'POST',
    url: '/v1/auth/exchange',
    payload: { provider: 'google', assertion: 'alice-assertion' },
  });
  return {
    app,
    accessToken: auth.json<{ accessToken: string }>().accessToken,
  };
}

async function request(
  app: Awaited<ReturnType<typeof buildApp>>,
  accessToken: string | undefined,
  body = multipart(wav()),
  key = 'transcription-1',
) {
  return app.inject({
    method: 'POST',
    url: '/v1/transcriptions',
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      'content-type': body.contentType,
      'idempotency-key': key,
    },
    payload: body.payload,
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('POST /v1/transcriptions', () => {
  it('requires bearer authentication', async () => {
    const { app } = await setup({
      transcribe: vi
        .fn()
        .mockResolvedValue({ transcript: 'private', language: 'en' }),
    });
    expect((await request(app, undefined)).statusCode).toBe(401);
  });

  it('transcribes supported audio and removes its temporary file', async () => {
    let temporaryPath = '';
    const provider: TranscriptionProvider = {
      async transcribe(path) {
        temporaryPath = path;
        await expect(access(path)).resolves.toBeUndefined();
        return { transcript: 'A quiet thought.', language: 'en' };
      },
    };
    const { app, accessToken } = await setup(provider);
    const response = await request(app, accessToken);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      transcript: 'A quiet thought.',
      language: 'en',
    });
    expect(
      response.json<{ durationSeconds: number }>().durationSeconds,
    ).toBeGreaterThan(0);
    await expect(access(temporaryPath)).rejects.toThrow();
  });

  it('rejects unsupported formats', async () => {
    const { app, accessToken } = await setup({ transcribe: vi.fn() });
    const response = await request(
      app,
      accessToken,
      multipart(Buffer.from('not audio'), 'voice.txt', 'text/plain'),
    );
    expect(response.statusCode).toBe(415);
  });

  it('rejects oversized files', async () => {
    const { app, accessToken } = await setup(
      { transcribe: vi.fn() },
      { maxBytes: 64 },
    );
    const response = await request(app, accessToken);
    expect(response.statusCode).toBe(413);
  });

  it('rejects unusable audio', async () => {
    const { app, accessToken } = await setup({ transcribe: vi.fn() });
    const response = await request(
      app,
      accessToken,
      multipart(Buffer.from('invalid'), 'voice.wav', 'audio/wav'),
    );
    expect(response.statusCode).toBe(422);
  });

  it('replays an idempotent result without invoking the provider twice', async () => {
    const transcribe = vi.fn().mockResolvedValue({
      transcript: 'A quiet thought.',
      language: 'en',
    });
    const { app, accessToken } = await setup({ transcribe });
    const first = await request(app, accessToken);
    const second = await request(app, accessToken);
    expect(second.json()).toEqual(first.json());
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it('enforces a per-account rate limit', async () => {
    const provider = {
      transcribe: vi
        .fn()
        .mockResolvedValue({ transcript: 'ok', language: 'en' }),
    };
    const { app, accessToken } = await setup(provider, {
      limiter: new AccountRateLimiter(1, 60_000),
    });
    expect(
      (await request(app, accessToken, multipart(wav()), 'first')).statusCode,
    ).toBe(200);
    expect(
      (await request(app, accessToken, multipart(wav()), 'second')).statusCode,
    ).toBe(429);
  });

  it.each([
    ['rate_limited', 429],
    ['temporary', 503],
    ['unusable', 422],
  ] as const)('maps %s provider failures to %i', async (kind, status) => {
    const { app, accessToken } = await setup({
      transcribe: vi
        .fn()
        .mockRejectedValue(new TranscriptionProviderError(kind)),
    });
    expect((await request(app, accessToken)).statusCode).toBe(status);
  });

  it('never logs audio, transcript text, credentials, or provider responses', async () => {
    let logs = '';
    const stream = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        logs += String(chunk);
        callback();
      },
    });
    const transcript = 'private transcript must stay out of logs';
    const { app, accessToken } = await setup(
      {
        transcribe: vi.fn().mockResolvedValue({ transcript, language: 'en' }),
      },
      { logger: { level: 'info', stream } },
    );
    const response = await request(app, accessToken);
    expect(response.statusCode).toBe(200);
    expect(logs).not.toContain(transcript);
    expect(logs).not.toContain(accessToken);
    expect(logs).not.toContain(wav().toString('base64'));
  });
});
