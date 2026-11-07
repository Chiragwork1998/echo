import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { parseReport, POST as report, REPORTS_PER_DAY } from '../api/report.js';
import { dayOf } from './meter.js';
import { useStore, type QuotaStore } from './store.js';
import { freshServer, tokenFor, VOICE_TOKEN } from './testing.js';
import { installKey, installTag } from './token.js';

// Reporting a card says why, and which lens. It can never carry what the card said, or anything a
// person wrote: a body with any other field is refused whole.

const INSTALL = '2c3d4e5f-6a7b-4c8d-9e0f-a1b2c3d4e5f6';
let store: QuotaStore;
let logged: string[] = [];
let ip = 0;
const nextIp = () => `198.18.0.${(ip = (ip % 250) + 1)}`;

beforeEach(() => {
  store = freshServer();
  logged = [];
  mock.method(console, 'log', (line: unknown) => void logged.push(String(line)));
});
afterEach(() => {
  mock.restoreAll();
  useStore(null);
});

/** A different install for every request unless one is named, so no test spends another's rate limit. */
let made = 0;
const anyInstall = () => ({ 'x-echo-install-token': tokenFor(`report-install-${String((made += 1)).padStart(8, '0')}`) });
const as = (installId: string) => ({ 'x-echo-install-token': tokenFor(installId) });
const send = (body: unknown, auth: Record<string, string> = anyInstall()) =>
  report(
    new Request('http://x/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp(), ...auth },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
const good = { reason: 'upsetting', lens: 'neff_self_compassion', model: 'gpt-6.1-sol', appVersion: '1.0.0+42' };
const counted = async (reason: string, lens: string) => (await store.read([`rep:${dayOf(Date.now())}:${reason}:${lens}`]))[0];

test('a report is counted by day, reason and lens, and answered plainly', async () => {
  const response = await send(good);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(await counted('upsetting', 'neff_self_compassion'), 1);
  await send({ reason: 'wrong', lens: null, model: 'gpt-6.1-sol' });
  await send({ reason: 'wrong' });
  assert.equal(await counted('wrong', 'none'), 2);
});

test('a report carrying anything else is refused whole, and nothing is counted', async () => {
  for (const body of [
    { ...good, text: 'The card said something I did not like.' },
    { ...good, quote: 'a few of my own words' },
    { ...good, card: { name: 'x' } },
    { ...good, details: '' },
  ]) {
    assert.equal((await send(body)).status, 400, JSON.stringify(Object.keys(body)));
  }
  assert.equal(await counted('upsetting', 'neff_self_compassion'), 0);
});

test('only the four reasons, a real lens, and short labels are taken', async () => {
  for (const body of [
    {},
    { reason: 'spam' },
    { reason: 'HARMFUL' },
    { reason: 'harmful', lens: 'not_a_lens' },
    { reason: 'harmful', lens: 7 },
    { reason: 'harmful', model: 'x'.repeat(65) },
    { reason: 'harmful', appVersion: '1'.repeat(65) },
    // Words cannot travel in a label: no spaces.
    { reason: 'harmful', model: 'I felt judged' },
    { reason: 'harmful', appVersion: '1.0 (the card was wrong)' },
    { reason: 'harmful', model: 5 },
    [good],
    'harmful',
    null,
  ]) {
    assert.equal((await send(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await send('not json')).status, 400);
  assert.equal((await send(JSON.stringify({ ...good, pad: 'x'.repeat(2_000) }))).status, 413);
  // Exactly 64 is still a label.
  assert.equal((await send({ reason: 'other', model: `m${'x'.repeat(63)}` })).status, 200);
  assert.equal(parseReport({ reason: 'harmful', lens: undefined })?.lens, null);
});

test('it takes an install token, or the shared token only while legacy is allowed', async () => {
  assert.equal((await send(good, {})).status, 401);
  assert.equal((await send(good, { 'x-echo-install-token': 'ei1.forged.token' })).status, 401);
  assert.equal((await send(good, { 'x-echo-voice-token': VOICE_TOKEN })).status, 200);
  freshServer({ ECHO_LEGACY_TOKEN: 'deny' });
  const denied = await send(good, { 'x-echo-voice-token': VOICE_TOKEN });
  assert.equal(denied.status, 401);
  assert.equal(((await denied.json()) as { error: string }).error, 'install_required');
  assert.equal((await send(good, as(INSTALL))).status, 200);
});

test('one install may report only so often in a day, counted across instances', async () => {
  const day = dayOf(Date.now());
  await store.spend([{ key: `i:${installKey(INSTALL)}:reports:${day}`, amount: REPORTS_PER_DAY - 1, limit: null, expireAt: null }]);
  assert.equal((await send(good, as(INSTALL))).status, 200);
  const refused = await send(good, as(INSTALL));
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get('retry-after')) > 0);
  assert.equal(await counted('upsetting', 'neff_self_compassion'), 1);
  // Another install is not affected.
  assert.equal((await send(good, { 'x-echo-install-token': tokenFor('3d4e5f6a-7b8c-4d9e-8f0a-b1c2d3e4f5a6') })).status, 200);
});

test('and this instance turns a burst away on its own', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 12; i += 1) statuses.push((await send(good, as('burst-install-00000001'))).status);
  assert.equal(statuses[0], 200);
  assert.equal(statuses.at(-1), 429);
});

test('the log line holds labels only: no token, no id, no words', async () => {
  const token = tokenFor(INSTALL);
  await send(good, { 'x-echo-install-token': token });
  assert.equal(logged.length, 1);
  const line = logged[0]!;
  assert.ok(!line.includes(token) && !line.includes(INSTALL));
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ['install', 'lens', 'model', 'ms', 'reason', 'route', 'status']);
  assert.equal(parsed.install, installTag(INSTALL));
  assert.equal(parsed.reason, 'upsetting');
});
