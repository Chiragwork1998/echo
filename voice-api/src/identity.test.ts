import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { GET as allowance } from '../api/allowance.js';
import { POST as install, useAttestor, INSTALLS_PER_HOUR } from '../api/install.js';
import { POST as liveSession } from '../api/live-session.js';
import { POST as patterns } from '../api/patterns.js';
import { POST as refine } from '../api/refine.js';
import { POST as transcribe } from '../api/transcribe.js';
import { noAttestor } from './attest.js';
import { addressKey } from './guard.js';
import { useStore, type QuotaStore } from './store.js';
import { freshServer, SECRET, tokenFor, upload, VOICE_TOKEN, wavBytes } from './testing.js';
import { issueToken, verifyToken } from './token.js';

const INSTALL = '9a8b7c6d-5e4f-4321-8fed-cba987654321';
const realFetch = globalThis.fetch;
let store: QuotaStore;
let openai = 0;
let ip = 0;
const nextIp = () => `192.0.2.${(ip = (ip % 250) + 1)}`;

beforeEach(() => {
  store = freshServer();
  openai = 0;
  mock.method(console, 'log', () => undefined);
  globalThis.fetch = (async (url: string | URL | Request) => {
    const address = String(url);
    if (address.includes('revenuecat')) return Response.json({ subscriber: { entitlements: {} } });
    openai += 1;
    if (address.endsWith('/realtime/client_secrets')) return Response.json({ value: 'ek_live', expires_at: 1 });
    if (address.endsWith('/audio/transcriptions')) return Response.json({ text: 'Synthetic words.', languages: [] });
    return Response.json({ output: [{ type: 'message', content: [{ text: 'aaj mera mann bhaari hai' }] }] });
  }) as typeof fetch;
});
afterEach(() => {
  mock.restoreAll();
  useStore(null);
  useAttestor(noAttestor);
  globalThis.fetch = realFetch;
});

const installRequest = (body: unknown, headers: Record<string, string> = { 'x-echo-voice-token': VOICE_TOKEN }, from = nextIp()) =>
  new Request('http://x/api/install', {
    method: 'POST',
    headers: { 'x-forwarded-for': from, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const asInstall = (token: string, path = '/api/x', body?: unknown) =>
  new Request(`http://x${path}`, {
    method: path === '/api/allowance' ? 'GET' : 'POST',
    headers: { 'x-echo-install-token': token, 'x-forwarded-for': nextIp() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const asLegacy = (path = '/api/x', body?: unknown) =>
  new Request(`http://x${path}`, {
    method: 'POST',
    headers: { 'x-echo-voice-token': VOICE_TOKEN, 'x-forwarded-for': nextIp() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const entries = Array.from({ length: 6 }, (_, day) => ({
  date: `2026-11-0${day + 1}`,
  text: `A synthetic entry for day ${day + 1}, about the same walk by the same river again.`,
}));

// --- /api/install -------------------------------------------------------------------------------

test('install: the shared token and an install id buy a signed token for that install', async () => {
  const response = await install(installRequest({ installId: INSTALL }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { token: string; expiresAt: string };
  const verdict = verifyToken(body.token, [SECRET], Date.now());
  assert.ok(verdict.ok);
  assert.equal(verdict.claims.installId, INSTALL);
  assert.equal(body.expiresAt, new Date(verdict.claims.expiresAt * 1000).toISOString());
});

test('install: a wrong shared token, a bad id, or a body it cannot read is refused', async () => {
  assert.equal((await install(installRequest({ installId: INSTALL }, { 'x-echo-voice-token': 'nope' }))).status, 401);
  assert.equal((await install(installRequest({ installId: INSTALL }, {}))).status, 401);
  for (const body of [{ installId: 'short' }, { installId: 5 }, {}, 'not json', { installId: 'a b c d e f g h i j k' }]) {
    assert.equal((await install(installRequest(body))).status, 400, JSON.stringify(body));
  }
});

test('install: without a secret to sign with, it says it is not configured', async () => {
  freshServer({ ECHO_INSTALL_SECRET: 'too-short' });
  assert.equal((await install(installRequest({ installId: INSTALL }))).status, 503);
});

test('install: one address may ask only so often in an hour, counted across instances', async () => {
  const from = '203.0.113.50';
  const hour = Math.floor(Date.now() / 3_600_000);
  // Other instances have already handed this address all but one of its hour.
  await store.spend([
    { key: `rl:install:${from}:${hour}`, amount: INSTALLS_PER_HOUR - 1, limit: null, expireAt: (hour + 2) * 3_600 },
  ]);
  assert.equal((await install(installRequest({ installId: INSTALL }, undefined, from))).status, 200);
  const refused = await install(installRequest({ installId: INSTALL }, undefined, from));
  assert.equal(refused.status, 429);
  const wait = Number(refused.headers.get('retry-after'));
  assert.ok(wait > 0 && wait <= 3_600);
  // Another address is not affected.
  assert.equal((await install(installRequest({ installId: INSTALL }, undefined, '203.0.113.51'))).status, 200);
});

test('install: this instance also turns away a burst from one address on its own', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    statuses.push((await install(installRequest({ installId: INSTALL }, undefined, '203.0.113.60'))).status);
  }
  assert.equal(statuses[0], 200);
  assert.equal(statuses.at(-1), 429);
});

test('install: an IPv6 phone counts as its /64, however it moves inside it', () => {
  assert.equal(addressKey('2001:db8:85a3:12:1:2:3:4'), '2001:db8:85a3:12::/64');
  assert.equal(addressKey('2001:db8:85a3:12:ffff::9'), '2001:db8:85a3:12::/64');
  assert.equal(addressKey('2001:0db8:85a3:0012::1'), '2001:db8:85a3:12::/64');
  assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(addressKey('::ffff:198.51.100.4'), '198.51.100.4');
  assert.equal(addressKey('198.51.100.4'), '198.51.100.4');
});

test('install: the place for attestation is ready, and a proof that fails is refused', async () => {
  useAttestor(async () => 'failed');
  assert.equal((await install(installRequest({ installId: INSTALL, attestation: { platform: 'android', token: 'x' } }))).status, 401);
  useAttestor(async () => 'verified');
  const verified = (await (await install(installRequest({ installId: INSTALL }))).json()) as { token: string };
  const verdict = verifyToken(verified.token, [SECRET], Date.now());
  assert.ok(verdict.ok && verdict.claims.attested);
  // Once attestation is required, an install that brings none gets no token.
  useAttestor(noAttestor);
  freshServer({ ECHO_REQUIRE_ATTESTATION: '1' });
  assert.equal((await install(installRequest({ installId: INSTALL }))).status, 401);
});

// --- who is asking ------------------------------------------------------------------------------

test('every route takes an install token, and refuses a tampered or expired one as install_invalid', async () => {
  const good = tokenFor(INSTALL);
  const [prefix, payload, signature] = good.split('.') as [string, string, string];
  const other = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), i: 'ffffffff-5e4f-4321-8fed-cba987654321' }),
  ).toString('base64url');
  const tampered = `${prefix}.${other}.${signature}`;
  const expired = issueToken({ installId: INSTALL }, SECRET, Date.now() - 31 * 86_400_000).token;
  const routes = [
    () => liveSession(asInstall(tampered)),
    () => refine(asInstall(tampered, '/api/refine', { text: 'hi' })),
    () => patterns(asInstall(tampered, '/api/patterns', { entries })),
    () => transcribe(upload(wavBytes({ samples: 2400 }), 'a.wav', { install: tampered })),
    () => allowance(asInstall(tampered, '/api/allowance')),
    () => liveSession(asInstall(expired)),
    () => transcribe(upload(wavBytes({ samples: 2400 }), 'a.wav', { install: expired })),
  ];
  for (const call of routes) {
    const response = await call();
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { error: string }).error, 'install_invalid');
  }
  assert.equal(openai, 0);
  assert.equal((await liveSession(asInstall(good))).status, 200);
});

test('an install token is not made good by also sending the shared token', async () => {
  const response = await liveSession(
    new Request('http://x/api/live-session', {
      method: 'POST',
      headers: { 'x-echo-install-token': 'ei1.garbage.garbage', 'x-echo-voice-token': VOICE_TOKEN, 'x-forwarded-for': nextIp() },
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(openai, 0);
});

test('legacy: the shared token alone works while allowed, and is refused when denied', async () => {
  assert.equal((await liveSession(asLegacy())).status, 200);
  assert.equal((await refine(asLegacy('/api/refine', { text: 'आज मेरा मन भारी है' }))).status, 200);
  freshServer({ ECHO_LEGACY_TOKEN: 'deny' });
  for (const response of [
    await liveSession(asLegacy()),
    await refine(asLegacy('/api/refine', { text: 'hi' })),
    await patterns(asLegacy('/api/patterns', { entries })),
    await transcribe(upload(wavBytes({ samples: 2400 }), 'a.wav', { shared: VOICE_TOKEN })),
  ]) {
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { error: string }).error, 'install_required');
  }
  // An install token is still good when legacy is denied.
  assert.equal((await liveSession(asInstall(tokenFor(INSTALL)))).status, 200);
});

test('legacy: allowed is the default, and anything but deny allows', async () => {
  for (const mode of [undefined, 'allow', 'ALLOW', 'yes']) {
    freshServer({ ECHO_LEGACY_TOKEN: mode });
    assert.equal((await liveSession(asLegacy())).status, 200, String(mode));
  }
  freshServer({ ECHO_LEGACY_TOKEN: ' Deny ' });
  assert.equal((await liveSession(asLegacy())).status, 401);
});

// --- what each plan may do ----------------------------------------------------------------------

test('live words: Plus mints a session, free is refused with 402 and spends nothing', async () => {
  process.env.ECHO_PLUS_INSTALLS = INSTALL;
  assert.equal((await liveSession(asInstall(tokenFor(INSTALL)))).status, 200);
  freshServer({ REVENUECAT_SECRET_KEY: 'sk_rc' });
  const free = await liveSession(asInstall(tokenFor(INSTALL)));
  assert.equal(free.status, 402);
  assert.deepEqual(await free.json(), {
    error: 'allowance_used',
    code: 'allowance_used',
    retryable: false,
    feature: 'live-words',
    plan: 'free',
    resetsAt: null,
  });
  assert.equal(openai, 1);
});

test('patterns: the first reading is free, the next is refused, and care is never refused', async () => {
  freshServer({ REVENUECAT_SECRET_KEY: 'sk_rc' });
  const card = {
    name: 'The same walk',
    noticed: 'It seems the same walk by the river keeps returning across your days.',
    evidence: [
      { entry: 'e1', quote: 'about the same walk by the same river' },
      { entry: 'e2', quote: 'about the same walk by the same river' },
    ],
    lens_id: 'pennebaker_expressing',
    lens: 'One way to see this is that writing it down helps it settle.',
    practice: 'Take one slow breath and notice your feet on the ground.',
    question: 'What does the river ask of you today?',
  };
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes('revenuecat')) return Response.json({ subscriber: { entitlements: {} } });
    openai += 1;
    return Response.json({ output: [{ type: 'message', content: [{ text: JSON.stringify({ concern: false, cards: [card] }) }] }] });
  }) as typeof fetch;

  const first = await patterns(asInstall(tokenFor(INSTALL), '/api/patterns', { entries }));
  assert.equal(first.status, 200);
  assert.equal(((await first.json()) as { status: string }).status, 'cards');
  const second = await patterns(asInstall(tokenFor(INSTALL), '/api/patterns', { entries }));
  assert.equal(second.status, 402);
  const body = (await second.json()) as Record<string, unknown>;
  assert.equal(body.feature, 'patterns');
  assert.equal(body.resetsAt, null);
  assert.equal(openai, 1);

  const worried = [...entries, { date: '2026-11-07', text: 'Some days I want to end my life.' }];
  const care = await patterns(asInstall(tokenFor(INSTALL), '/api/patterns', { entries: worried }));
  assert.deepEqual(await care.json(), { status: 'support' });
  assert.equal(openai, 1);
});

test('refine: tidy and the script step follow the plan, and words are never lost to a cap', async () => {
  freshServer({ REVENUECAT_SECRET_KEY: 'sk_rc' });
  const tidy = await refine(asInstall(tokenFor(INSTALL), '/api/refine', { text: 'um so I walked', style: 'tidy' }));
  assert.deepEqual(await tidy.json(), { text: 'um so I walked', polished: false, romanised: false, style: 'exact' });
  assert.equal(openai, 0);
  // Hindi in Roman script is part of exact words, for everyone.
  const hindi = await refine(asInstall(tokenFor(INSTALL), '/api/refine', { text: 'आज मेरा मन भारी है' }));
  assert.equal(((await hindi.json()) as { romanised: boolean }).romanised, true);
  assert.equal(openai, 1);
});

test('allowance: says what the month has used, for the app to check before a long take', async () => {
  freshServer({ REVENUECAT_SECRET_KEY: 'sk_rc' });
  await transcribe(upload(wavBytes({ rate: 8000, samples: 8000 * 90 }), 'a.wav', { install: tokenFor(INSTALL) }));
  const response = await allowance(asInstall(tokenFor(INSTALL), '/api/allowance'));
  const body = (await response.json()) as { plan: string; voice: { usedSeconds: number; limitSeconds: number; resetsAt: string } };
  assert.equal(body.plan, 'free');
  assert.equal(body.voice.usedSeconds, 90);
  assert.equal(body.voice.limitSeconds, 3_600);
  assert.match(body.voice.resetsAt, /^\d{4}-\d{2}-01T00:00:00\.000Z$/);
  const legacy = await allowance(
    new Request('http://x/api/allowance', { headers: { 'x-echo-voice-token': VOICE_TOKEN, 'x-forwarded-for': nextIp() } }),
  );
  assert.deepEqual(await legacy.json(), { plan: 'legacy', voice: null });
  assert.ok(store);
});
