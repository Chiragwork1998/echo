import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { POST as liveSession } from '../api/live-session.js';
import { POST as refine } from '../api/refine.js';

const TOKEN = 'test-token';
const realFetch = globalThis.fetch;
let calls: string[] = [];

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.ECHO_VOICE_TOKEN = TOKEN;
  calls = [];
  mock.method(console, 'log', () => undefined);
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (String(url).endsWith('/realtime/client_secrets')) {
      return Response.json({ value: 'ek_x', expires_at: 1 });
    }
    return Response.json({ output: [{ type: 'message', content: [{ text: 'aaj mera mann bhaari hai' }] }] });
  }) as typeof fetch;
});
afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = realFetch;
});

const post = (body: unknown, token: string | null = TOKEN, ip = '1.1.1.1') =>
  new Request('http://x/api', {
    method: 'POST',
    headers: { ...(token ? { 'x-echo-voice-token': token } : {}), 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('refine needs the app token', async () => {
  assert.equal((await refine(post({ text: 'hi' }, null))).status, 401);
  assert.equal((await refine(post({ text: 'hi' }, 'nope'))).status, 401);
  assert.deepEqual(calls, []);
});

test('refine rejects what is not text', async () => {
  assert.equal((await refine(post('not json'))).status, 400);
  assert.equal((await refine(post({ text: '   ' }))).status, 400);
  assert.equal((await refine(post({ text: 5 }))).status, 400);
});

test('refine: exact text with no Devanagari comes back untouched, with no model call', async () => {
  const response = await refine(post({ text: 'um, I mean, I miss him. Actually no, I needed him.' }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { text: string; style: string; polished: boolean; romanised: boolean };
  assert.equal(body.text, 'um, I mean, I miss him. Actually no, I needed him.');
  assert.equal(body.style, 'exact');
  assert.equal(body.romanised, false);
  assert.deepEqual(calls, []);
});

test('refine: exact Devanagari gets the script step, and a style it does not know is exact', async () => {
  const response = await refine(post({ text: 'आज मेरा मन भारी है', style: 'whatever' }, TOKEN, '2.2.2.2'));
  const body = (await response.json()) as { text: string; style: string; romanised: boolean };
  assert.equal(body.style, 'exact');
  assert.equal(body.romanised, true);
  assert.equal(body.text, 'aaj mera mann bhaari hai');
  assert.equal(calls.length, 1);
});

test('live-session needs the app token and mints a secret for a transcription session', async () => {
  assert.equal((await liveSession(post('', null, '3.3.3.3'))).status, 401);
  const response = await liveSession(post('', TOKEN, '3.3.3.3'));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { url: string; secret: string; sampleRate: number };
  assert.equal(body.secret, 'ek_x');
  assert.equal(body.sampleRate, 24000);
  assert.ok(body.url.startsWith('wss://'));
  assert.ok(!JSON.stringify(body).includes('sk-test'));
});

test('live-session is rate limited like the other routes', async () => {
  let last = 200;
  for (let i = 0; i < 45; i += 1) last = (await liveSession(post('', TOKEN, '4.4.4.4'))).status;
  assert.equal(last, 429);
});

test('without a key or token configured, the routes say so', async () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal((await refine(post({ text: 'hi' }))).status, 503);
  assert.equal((await liveSession(post(''))).status, 503);
});
