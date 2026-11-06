import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { POST as refine } from '../api/refine.js';
import { POST as transcribe } from '../api/transcribe.js';

// A journal is the most private thing a person writes. Whatever else a log line says, it says nothing
// about what was in the request: not the words, not which language, not whether a step changed them.

const TOKEN = 'test-token';
const SPOKEN = 'आज मेरा मन बहुत भारी है यार, I think I need rest।';
const ROMAN = 'aaj mera mann bahut bhaari hai yaar, I think I need rest.';
const realFetch = globalThis.fetch;
let logged: string[] = [];

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.ECHO_VOICE_TOKEN = TOKEN;
  logged = [];
  mock.method(console, 'log', (line: unknown) => void logged.push(String(line)));
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).endsWith('/audio/transcriptions')) {
      return Response.json({ text: SPOKEN, languages: [{ code: 'hi' }, { code: 'en' }], usage: { seconds: 7 } });
    }
    return Response.json({ output: [{ type: 'message', content: [{ text: ROMAN }] }] });
  }) as typeof fetch;
});
afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = realFetch;
});

const upload = (ip: string, style?: string) => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'take.m4a', { type: 'audio/mp4' }));
  if (style) form.set('style', style);
  return new Request('http://x/api/transcribe', {
    method: 'POST',
    headers: { 'x-echo-voice-token': TOKEN, 'x-forwarded-for': ip },
    body: form,
  });
};
const refineRequest = (ip: string, body: unknown) =>
  new Request('http://x/api/refine', {
    method: 'POST',
    headers: { 'x-echo-voice-token': TOKEN, 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });

/** One log line, parsed, with the checks that hold for every route. */
function onlyLine() {
  assert.equal(logged.length, 1);
  const line = logged[0]!;
  for (const secret of [SPOKEN, ROMAN, 'aaj', 'hi', 'rest']) {
    // 'hi' is also a language code, so look for it as a value or a key rather than as letters.
    if (secret === 'hi') assert.ok(!/"hi"|"languages"/.test(line));
    else assert.ok(!line.includes(secret));
  }
  return JSON.parse(line) as Record<string, unknown>;
}

test('transcribe logs the route, the status, the size and the time, and nothing about the words', async () => {
  for (const [style, ip] of [
    ['exact', '10.0.0.1'],
    ['tidy', '10.0.0.2'],
  ] as const) {
    logged = [];
    const response = await transcribe(upload(ip, style));
    assert.equal(response.status, 200);
    // The reply carries all of it, because the phone needs it. The log does not.
    const body = (await response.json()) as Record<string, unknown>;
    assert.ok('romanised' in body && 'polished' in body && 'languages' in body);
    assert.deepEqual(Object.keys(onlyLine()).sort(), ['bytes', 'ms', 'route', 'status']);
    const line = onlyLine();
    assert.equal(line.route, 'transcribe');
    assert.equal(line.status, 200);
    assert.equal(line.bytes, 4);
  }
});

test('transcribe logs a failure by its status alone', async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  const response = await transcribe(upload('10.0.0.3'));
  assert.equal(response.status, 502);
  const line = onlyLine();
  assert.deepEqual(Object.keys(line).sort(), ['ms', 'route', 'status']);
  assert.equal(line.status, 502);
});

test('refine logs the route, the status, the size and the time, and nothing about the words', async () => {
  const response = await refine(refineRequest('10.0.0.4', { text: SPOKEN }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.romanised, true);
  const line = onlyLine();
  assert.deepEqual(Object.keys(line).sort(), ['bytes', 'ms', 'route', 'status']);
  assert.equal(line.route, 'refine');
  assert.equal(line.status, 200);
  assert.equal(typeof line.bytes, 'number');
});
