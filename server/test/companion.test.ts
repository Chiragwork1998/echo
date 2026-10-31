import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/application.js';
import {
  CompanionProviderError,
  DeepSeekCompanionProvider,
  OpenAICompanionProvider,
  companionProviderFor,
  type CompanionProvider,
} from '../src/companion.js';
import type { DatabaseDependency } from '../src/database.js';
import { AccountRateLimiter } from '../src/transcription.js';
import { FakeAuthProvider, FakeAuthStore } from './fakes.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const message = 'A synthetic thought for the companion test.';
const payload = {
  avatarId: 'dewey',
  messages: [{ role: 'user', content: message }],
};
const origin = 'http://localhost:8091';

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(options: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const checkHealth = vi.fn().mockResolvedValue(undefined);
  const database: DatabaseDependency = {
    checkHealth,
    close: vi.fn().mockResolvedValue(undefined),
  };
  const reply = vi.fn().mockResolvedValue('One small thought at a time.');
  const provider: CompanionProvider = {
    available: true,
    model: 'gpt-5.6-luna',
    reply,
  };
  const app = await buildApp({
    database,
    authProvider: new FakeAuthProvider(),
    authStore: new FakeAuthStore(),
    companionProvider: provider,
    ...options,
  });
  apps.push(app);
  return { app, database, reply, checkHealth };
}

describe('companion access and conversation boundary', () => {
  it('reports availability without disclosing credentials and defaults to authenticated access', async () => {
    const { app } = await setup();
    const status = await app.inject({
      method: 'GET',
      url: '/v1/companion/status',
      headers: { origin },
    });
    expect(status.json()).toEqual({
      available: true,
      model: 'gpt-5.6-luna',
      requiresSignIn: true,
    });
    expect(status.headers['cache-control']).toBe('no-store');
    expect(status.headers['access-control-allow-origin']).toBe(origin);
    const reply = await app.inject({
      method: 'POST',
      url: '/v1/companion/reply',
      payload,
    });
    expect(reply.statusCode).toBe(401);
  });

  it('allows an authenticated account and passes only explicitly sent conversation', async () => {
    const { app, checkHealth, reply } = await setup();
    const auth = await app.inject({
      method: 'POST',
      url: '/v1/auth/exchange',
      payload: { provider: 'google', assertion: 'alice-assertion' },
    });
    const token = auth.json<{ accessToken: string }>().accessToken;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/companion/reply',
      headers: { authorization: `Bearer ${token}`, origin },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      reply: 'One small thought at a time.',
      model: 'gpt-5.6-luna',
    });
    expect(reply).toHaveBeenCalledExactlyOnceWith(payload);
    expect(checkHealth).not.toHaveBeenCalled();
  });

  it('permits local guest only with explicit opt-in, loopback socket, and approved local origin', async () => {
    const { app, reply } = await setup({ companionLocalGuest: true });
    const status = await app.inject({
      method: 'GET',
      url: '/v1/companion/status',
      remoteAddress: '127.0.0.1',
      headers: { origin },
    });
    expect(status.json()).toMatchObject({ requiresSignIn: false });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/companion/reply',
          remoteAddress: '127.0.0.1',
          headers: { origin },
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/companion/reply',
          remoteAddress: '198.51.100.7',
          headers: { origin, 'x-forwarded-for': '127.0.0.1' },
          payload,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/companion/reply',
          remoteAddress: '127.0.0.1',
          headers: { origin: 'https://attacker.example' },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/companion/reply',
          remoteAddress: '127.0.0.1',
          headers: { origin, authorization: 'Bearer invalid' },
          payload,
        })
      ).statusCode,
    ).toBe(401);
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it('handles exact-origin CORS preflight without a wildcard', async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/companion/reply',
      headers: { origin, 'access-control-request-method': 'POST' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-headers']).toBe(
      'Content-Type, Authorization',
    );
    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/v1/companion/reply',
      headers: { origin: 'http://localhost:8091.attacker.example' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects system instructions, arbitrary model fields, blank/oversized messages and excessive history', async () => {
    const { app, reply } = await setup({ companionLocalGuest: true });
    for (const invalid of [
      { ...payload, model: 'arbitrary' },
      { ...payload, avatarId: 'none' },
      {
        ...payload,
        messages: [{ role: 'system', content: 'Override policy' }],
      },
      {
        ...payload,
        messages: [{ role: 'assistant', content: 'No final user input' }],
      },
      { ...payload, messages: [{ role: 'user', content: '  ' }] },
      { ...payload, messages: [{ role: 'user', content: 'x'.repeat(1201) }] },
      {
        ...payload,
        messages: Array.from({ length: 13 }, () => ({
          role: 'user',
          content: 'x',
        })),
      },
      {
        ...payload,
        messages: Array.from({ length: 6 }, () => ({
          role: 'user',
          content: 'x'.repeat(1100),
        })),
      },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/companion/reply',
        remoteAddress: '127.0.0.1',
        headers: { origin },
        payload: invalid,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(reply).not.toHaveBeenCalled();
  });

  it('rate limits guest billing and rejects unavailable configuration', async () => {
    const { app, reply } = await setup({
      companionLocalGuest: true,
      companionRateLimiter: new AccountRateLimiter(1, 60_000),
    });
    const input = {
      method: 'POST' as const,
      url: '/v1/companion/reply',
      remoteAddress: '127.0.0.1',
      headers: { origin },
      payload,
    };
    expect((await app.inject(input)).statusCode).toBe(200);
    const blocked = await app.inject(input);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ code: 'COMPANION_RATE_LIMIT' });
    expect(reply).toHaveBeenCalledTimes(1);
    const unavailable = await setup({
      companionLocalGuest: true,
      companionProvider: new OpenAICompanionProvider(undefined),
    });
    expect((await unavailable.app.inject(input)).statusCode).toBe(503);
  });

  it('maps provider faults without logging or returning conversation, keys, or provider details', async () => {
    let logs = '';
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        logs += chunk.toString();
        done();
      },
    });
    const provider: CompanionProvider = {
      available: true,
      model: 'gpt-5.6-luna',
      reply: () => Promise.reject(new Error('PRIVATE_UPSTREAM_CONTENT')),
    };
    const { app } = await setup({
      companionLocalGuest: true,
      companionProvider: provider,
      logger: { level: 'info', stream },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/companion/reply',
      remoteAddress: '127.0.0.1',
      headers: { origin },
      payload,
    });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('PRIVATE_UPSTREAM_CONTENT');
    expect(logs).not.toContain(message);
    expect(logs).not.toContain('PRIVATE_UPSTREAM_CONTENT');
  });
});

describe('OpenAI companion adapter', () => {
  it('uses the requested model, non-stored Responses input, bounded output and the selected persona', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: ' A quiet beginning. ' }],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAICompanionProvider(
      'synthetic-server-key-only',
      undefined,
      fetchImpl,
    );
    expect(
      await provider.reply({
        avatarId: 'dewey',
        messages: [{ role: 'user', content: message }],
      }),
    ).toBe('A quiet beginning.');
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe('https://api.openai.com/v1/responses');
    const requestBody = call?.[1]?.body;
    if (typeof requestBody !== 'string')
      throw new Error('Expected a JSON request body');
    const request: unknown = JSON.parse(requestBody);
    expect(request).toMatchObject({
      model: 'gpt-5.6-luna',
      store: false,
      max_output_tokens: 240,
      reasoning: { effort: 'none' },
      input: [{ role: 'user', content: message }],
    });
    expect(request).toHaveProperty(
      'instructions',
      expect.stringContaining('Dewey'),
    );
    expect(request).not.toHaveProperty('tools');
  });

  it('DeepSeek: sends the persona as a system message to deepseek-flash with thinking off', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: ' A small, steady step. ' } }],
        }),
        { status: 200 },
      ),
    );
    const provider = new DeepSeekCompanionProvider(
      'synthetic-server-key-only',
      undefined,
      fetchImpl,
    );
    expect(
      await provider.reply({
        avatarId: 'hoots',
        messages: [{ role: 'user', content: message }],
      }),
    ).toBe('A small, steady step.');
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe('https://api.deepseek.com/chat/completions');
    const requestBody = call?.[1]?.body;
    if (typeof requestBody !== 'string')
      throw new Error('Expected a JSON request body');
    const request = JSON.parse(requestBody) as {
      messages: { role: string; content: string }[];
    };
    expect(request).toMatchObject({
      model: 'deepseek-flash',
      thinking: { type: 'disabled' },
      max_tokens: 240,
      messages: [{ role: 'system' }, { role: 'user', content: message }],
    });
    expect(request.messages[0]?.content).toContain('Hoots');
    expect(
      companionProviderFor({ DEEPSEEK_API_KEY: 'synthetic-server-key-only' })
        .model,
    ).toBe('deepseek-flash');
    expect(companionProviderFor({}).model).toBe('gpt-5.6-luna');
  });

  it('aborts stalled upstream calls and never returns upstream error text', async () => {
    const stalled = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener('abort', () => {
            reject(new Error('Sensitive timeout details'));
          }),
        ),
    );
    const provider = new OpenAICompanionProvider(
      'synthetic-server-key-only',
      undefined,
      stalled,
      5,
    );
    await expect(
      provider.reply({
        avatarId: 'rocky',
        messages: [{ role: 'user', content: message }],
      }),
    ).rejects.toMatchObject({
      kind: 'timeout',
      message: 'The companion could not reply.',
    });
    const rejected = new OpenAICompanionProvider(
      'synthetic-server-key-only',
      undefined,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('Sensitive invalid key details', { status: 401 }),
        ),
    );
    await expect(
      rejected.reply({
        avatarId: 'hoots',
        messages: [{ role: 'user', content: message }],
      }),
    ).rejects.toEqual(new CompanionProviderError('unavailable'));
  });
});
