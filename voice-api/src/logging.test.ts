import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { POST as install } from '../api/install.js';
import { POST as liveSession } from '../api/live-session.js';
import { POST as refine } from '../api/refine.js';
import { POST as transcribe } from '../api/transcribe.js';
import { useStore } from './store.js';
import { fixture, freshServer, SECRET, tokenFor, upload, VOICE_TOKEN } from './testing.js';
import { installTag } from './token.js';

// A journal is the most private thing a person writes. Whatever else a log line says, it says nothing
// about what was in the request: not the words, not which language, not whether a step changed them.
// And nothing that could be used as a key: never an install token, and an install id only hashed.

const SPOKEN = 'आज मेरा मन बहुत भारी है यार, I think I need rest।';
const ROMAN = 'aaj mera mann bahut bhaari hai yaar, I think I need rest.';
const INSTALL = '6a1f0c2e-9b7d-4e3a-8c5f-0d1e2f3a4b5c';
const realFetch = globalThis.fetch;
let logged: string[] = [];

beforeEach(() => {
  freshServer({ ECHO_PLUS_INSTALLS: INSTALL });
  logged = [];
  mock.method(console, 'log', (line: unknown) => void logged.push(String(line)));
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).endsWith('/audio/transcriptions')) {
      return Response.json({ text: SPOKEN, languages: [{ code: 'hi' }, { code: 'en' }], usage: { seconds: 7 } });
    }
    if (String(url).endsWith('/realtime/client_secrets')) return Response.json({ value: 'ek_x', expires_at: 1 });
    return Response.json({ output: [{ type: 'message', content: [{ text: ROMAN }] }] });
  }) as typeof fetch;
});
afterEach(() => {
  mock.restoreAll();
  useStore(null);
  globalThis.fetch = realFetch;
});

const take = fixture('say.m4a');
const refineRequest = (ip: string, body: unknown, headers: Record<string, string>) =>
  new Request('http://x/api/refine', {
    method: 'POST',
    headers: { ...headers, 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });

/** One log line, parsed, with the checks that hold for every route. */
function onlyLine(token?: string) {
  assert.equal(logged.length, 1);
  const line = logged[0]!;
  for (const secret of [SPOKEN, ROMAN, 'aaj', 'hi', 'rest', INSTALL, SECRET, VOICE_TOKEN, 'sk-test', 'ek_x']) {
    // 'hi' is also a language code, so look for it as a value or a key rather than as letters.
    if (secret === 'hi') assert.ok(!/"hi"|"languages"/.test(line));
    else assert.ok(!line.includes(secret), secret);
  }
  if (token) {
    assert.ok(!line.includes(token));
    // Nor any piece of it that could be put back together.
    for (const part of token.split('.')) assert.ok(!line.includes(part));
  }
  return JSON.parse(line) as Record<string, unknown>;
}

test('transcribe logs the route, the status, the size and the time, and nothing about the words', async () => {
  for (const [style, ip] of [
    ['exact', '10.0.0.1'],
    ['tidy', '10.0.0.2'],
  ] as const) {
    logged = [];
    const response = await transcribe(upload(take, 'take.m4a', { shared: VOICE_TOKEN }, ip, style));
    assert.equal(response.status, 200);
    // The reply carries all of it, because the phone needs it. The log does not.
    const body = (await response.json()) as Record<string, unknown>;
    assert.ok('romanised' in body && 'polished' in body && 'languages' in body);
    const line = onlyLine();
    assert.deepEqual(Object.keys(line).sort(), ['bytes', 'ms', 'plan', 'route', 'status']);
    assert.equal(line.route, 'transcribe');
    assert.equal(line.status, 200);
    assert.equal(line.bytes, take.length);
    assert.equal(line.plan, 'legacy');
  }
});

test('with an install token, the line names the install by a hash of its id, and never the token', async () => {
  const token = tokenFor(INSTALL);
  const response = await transcribe(upload(take, 'take.m4a', { install: token }, '10.0.0.9'));
  assert.equal(response.status, 200);
  const line = onlyLine(token);
  assert.deepEqual(Object.keys(line).sort(), ['bytes', 'install', 'ms', 'plan', 'route', 'status']);
  assert.equal(line.install, installTag(INSTALL));
  assert.equal(line.plan, 'plus');
  assert.match(String(line.install), /^[0-9a-f]{12}$/);
});

test('transcribe logs a failure by its status alone', async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  const response = await transcribe(upload(take, 'take.m4a', { shared: VOICE_TOKEN }, '10.0.0.3'));
  assert.equal(response.status, 502);
  const line = onlyLine();
  assert.deepEqual(Object.keys(line).sort(), ['ms', 'route', 'status']);
  assert.equal(line.status, 502);
});

test('refine logs the route, the status, the size and the time, and nothing about the words', async () => {
  const token = tokenFor(INSTALL);
  const response = await refine(refineRequest('10.0.0.4', { text: SPOKEN }, { 'x-echo-install-token': token }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.romanised, true);
  const line = onlyLine(token);
  assert.deepEqual(Object.keys(line).sort(), ['bytes', 'install', 'ms', 'route', 'status']);
  assert.equal(line.route, 'refine');
  assert.equal(line.status, 200);
  assert.equal(typeof line.bytes, 'number');
});

test('install and live-session log the install by its hash, and never the token they hand out', async () => {
  const response = await install(
    new Request('http://x/api/install', {
      method: 'POST',
      headers: { 'x-echo-voice-token': VOICE_TOKEN, 'x-forwarded-for': '10.0.0.5' },
      body: JSON.stringify({ installId: INSTALL }),
    }),
  );
  assert.equal(response.status, 200);
  const { token } = (await response.json()) as { token: string };
  assert.deepEqual(Object.keys(onlyLine(token)).sort(), ['install', 'ms', 'route', 'status']);

  logged = [];
  const live = await liveSession(
    new Request('http://x/api/live-session', {
      method: 'POST',
      headers: { 'x-echo-install-token': token, 'x-forwarded-for': '10.0.0.6' },
    }),
  );
  assert.equal(live.status, 200);
  assert.deepEqual(Object.keys(onlyLine(token)).sort(), ['install', 'ms', 'plan', 'route', 'status']);
});
