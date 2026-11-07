import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { POST as transcribe } from '../api/transcribe.js';
import { ALLOWANCES, monthOf } from './meter.js';
import { useStore, type QuotaStore } from './store.js';
import { adtsFrames, fixture, freshServer, tokenFor, upload, VOICE_TOKEN, wavBytes } from './testing.js';
import { installKey } from './token.js';

const realFetch = globalThis.fetch;
const realBinary = process.env.ECHO_FFMPEG;
let store: QuotaStore;
let transcriptions = 0;

beforeEach(() => {
  store = freshServer();
  transcriptions = 0;
  mock.method(console, 'log', () => undefined);
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).endsWith('/audio/transcriptions')) transcriptions += 1;
    return Response.json({ text: 'I am here.', languages: [], usage: { seconds: 2 } });
  }) as typeof fetch;
  // ffmpeg stands in as a script that answers at once: the sound itself is never decoded here.
  const dir = mkdtempSync(join(tmpdir(), 'echo-route-'));
  const quick = join(dir, 'quick.sh');
  writeFileSync(quick, '#!/bin/sh\ncat > /dev/null\nprintf flac\n');
  chmodSync(quick, 0o755);
  process.env.ECHO_FFMPEG = quick;
});
afterEach(() => {
  mock.restoreAll();
  useStore(null);
  globalThis.fetch = realFetch;
  if (realBinary === undefined) delete process.env.ECHO_FFMPEG;
  else process.env.ECHO_FFMPEG = realBinary;
});

const INSTALL = '0f6b1d3e-2c4a-4b8e-9d7f-1a2b3c4d5e6f';
const usedKey = (id = INSTALL) => `i:${installKey(id)}:voice:${monthOf(Date.now())}`;
/** A 24 kHz mono WAV of exactly `ms` milliseconds. */
const wavOf = (ms: number) => wavBytes({ rate: 24000, samples: (ms * 24000) / 1000 });

test('a flood of Android takes is answered with try again, not with a stalled server', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'echo-route-'));
  const slow = join(dir, 'slow.sh');
  writeFileSync(slow, '#!/bin/sh\ncat > /dev/null\nsleep 0.6\nprintf flac\n');
  chmodSync(slow, 0o755);
  process.env.ECHO_FFMPEG = slow;

  const take = adtsFrames(200);
  const responses = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      transcribe(upload(take, 'take.aac', { install: tokenFor(`install-flood-${String(i).padStart(8, '0')}`) }, `10.1.0.${i}`)),
    ),
  );
  const busy = responses.filter((response) => response.status === 503);
  const served = responses.filter((response) => response.status === 200);
  assert.ok(busy.length >= 1, 'some were turned away');
  assert.ok(served.length >= 1, 'some were served');
  assert.equal(busy.length + served.length, 12);
  assert.deepEqual(await busy[0]!.json(), { error: 'busy', code: 'busy', retryable: true });
  // A take turned away by a full machine was not served, so it took nothing from the allowance.
  const used = await store.read(
    Array.from({ length: 12 }, (_, i) => usedKey(`install-flood-${String(i).padStart(8, '0')}`)),
  );
  assert.equal(used.filter((ms) => ms > 0).length, served.length);
});

test('the sound is counted from the file, exactly, and taken from the month', async () => {
  const response = await transcribe(upload(fixture('say-16k.aac'), 'speech.aac', { install: tokenFor(INSTALL) }));
  assert.equal(response.status, 200);
  // 42 frames of 1,024 samples at 16 kHz: what ffmpeg decodes from the same file.
  assert.deepEqual(await store.read([usedKey()]), [2688]);
  const wav = await transcribe(upload(fixture('say-24k.wav'), 'speech.wav', { install: tokenFor(INSTALL) }));
  assert.equal(wav.status, 200);
  assert.deepEqual(await store.read([usedKey()]), [2688 + 2575]);
});

test('a number the phone sends about its recording is never what is counted', async () => {
  const form = new FormData();
  form.set('file', new File([wavOf(30_000)], 'speech.wav'));
  form.set('seconds', '1');
  form.set('durationMs', '1');
  const response = await transcribe(
    new Request('http://x/api/transcribe', {
      method: 'POST',
      headers: { 'x-echo-install-token': tokenFor(INSTALL), 'x-forwarded-for': '198.51.100.7', 'x-echo-seconds': '1' },
      body: form,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await store.read([usedKey()]), [30_000]);
});

test('a free install gets 60 minutes in a month, to the millisecond, and a refusal spends nothing', async () => {
  process.env.REVENUECAT_SECRET_KEY = 'sk_rc_test';
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes('revenuecat')) return Response.json({ subscriber: { entitlements: {} } });
    if (String(url).endsWith('/audio/transcriptions')) transcriptions += 1;
    return Response.json({ text: 'I am here.', languages: [], usage: { seconds: 2 } });
  }) as typeof fetch;
  const limit = ALLOWANCES.free.voiceMs;
  await store.spend([{ key: usedKey(), amount: limit - 4_000, limit: null, expireAt: null }]);

  // Exactly what is left fits.
  assert.equal((await transcribe(upload(wavOf(4_000), 'speech.wav', { install: tokenFor(INSTALL) }))).status, 200);
  assert.deepEqual(await store.read([usedKey()]), [limit]);

  // One millisecond more does not, and nothing is spent: no audio counted, no call made.
  const before = transcriptions;
  const refused = await transcribe(upload(wavOf(1), 'speech.wav', { install: tokenFor(INSTALL) }));
  assert.equal(refused.status, 402);
  const body = (await refused.json()) as Record<string, unknown>;
  assert.equal(body.error, 'allowance_used');
  assert.equal(body.feature, 'voice');
  assert.equal(body.plan, 'free');
  const next = new Date();
  assert.equal(body.resetsAt, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1)).toISOString());
  assert.equal(transcriptions, before);
  assert.deepEqual(await store.read([usedKey()]), [limit]);
});

test('Plus gets 20 hours a month', async () => {
  process.env.ECHO_PLUS_INSTALLS = INSTALL;
  await store.spend([{ key: usedKey(), amount: ALLOWANCES.plus.voiceMs - 2_000, limit: null, expireAt: null }]);
  assert.equal((await transcribe(upload(wavOf(2_000), 'speech.wav', { install: tokenFor(INSTALL) }))).status, 200);
  const refused = await transcribe(upload(wavOf(1), 'speech.wav', { install: tokenFor(INSTALL) }));
  assert.equal(refused.status, 402);
  assert.equal(((await refused.json()) as { plan: string }).plan, 'plus');
});

test('a recording OpenAI could not take is given back, and silence is not', async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  assert.equal((await transcribe(upload(wavOf(5_000), 'speech.wav', { install: tokenFor(INSTALL) }))).status, 502);
  assert.deepEqual(await store.read([usedKey()]), [0]);

  globalThis.fetch = (async () => Response.json({ text: '  ', languages: [] })) as typeof fetch;
  assert.equal((await transcribe(upload(wavOf(5_000), 'speech.wav', { install: tokenFor(INSTALL) }))).status, 422);
  assert.deepEqual(await store.read([usedKey()]), [5_000]);
});

test('a file that cannot be measured is refused, and nothing is sent', async () => {
  for (const [bytes, name] of [
    [new Uint8Array([1, 2, 3, 4]), 'take.aac'],
    [new Uint8Array(400).fill(7), 'take.wav'],
    [new Uint8Array(400).fill(7), 'take.m4a'],
    [new Uint8Array(400).fill(7), 'take.mp3'],
    [new Uint8Array(400).fill(7), 'take.webm'],
  ] as const) {
    const response = await transcribe(upload(bytes, name, { install: tokenFor(INSTALL) }));
    assert.equal(response.status, 415, name);
  }
  assert.equal(transcriptions, 0);
});

test('tidy is Plus: a free install gets its words exact, and Plus gets them tidied', async () => {
  process.env.REVENUECAT_SECRET_KEY = 'sk_rc_test';
  const asked: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const address = String(url);
    if (address.includes('revenuecat')) return Response.json({ subscriber: { entitlements: {} } });
    asked.push(address.split('/').at(-1)!);
    if (address.endsWith('/responses')) {
      return Response.json({ output: [{ type: 'message', content: [{ text: 'I am here, today.' }] }] });
    }
    return Response.json({ text: 'um I am here today', languages: [] });
  }) as typeof fetch;

  const free = await transcribe(upload(wavOf(1_000), 'speech.wav', { install: tokenFor(INSTALL) }, undefined, 'tidy'));
  const freeBody = (await free.json()) as { style: string; polished: boolean; text: string };
  assert.equal(freeBody.style, 'exact');
  assert.equal(freeBody.text, 'um I am here today');
  assert.deepEqual(asked, ['transcriptions']);

  process.env.ECHO_PLUS_INSTALLS = INSTALL;
  asked.length = 0;
  const plus = await transcribe(upload(wavOf(1_000), 'speech.wav', { install: tokenFor(INSTALL) }, undefined, 'tidy'));
  const plusBody = (await plus.json()) as { style: string; polished: boolean };
  assert.equal(plusBody.style, 'tidy');
  assert.equal(plusBody.polished, true);
  assert.deepEqual(asked, ['transcriptions', 'responses']);
});

test('the day has a ceiling on audio, and past it everyone is told to come back', async () => {
  process.env.ECHO_DAILY_AUDIO_SECONDS = '10';
  process.env.ECHO_PLUS_INSTALLS = INSTALL;
  assert.equal((await transcribe(upload(wavOf(8_000), 'speech.wav', { install: tokenFor(INSTALL) }))).status, 200);
  const busy = await transcribe(upload(wavOf(3_000), 'speech.wav', { install: tokenFor(INSTALL) }));
  assert.equal(busy.status, 503);
  const body = (await busy.json()) as { error: string; retryAfter: number };
  assert.equal(body.error, 'busy');
  assert.ok(body.retryAfter > 0 && body.retryAfter <= 86_400);
  assert.equal(busy.headers.get('retry-after'), String(body.retryAfter));
  // The shared token from older builds is held to the same ceiling.
  assert.equal((await transcribe(upload(wavOf(3_000), 'speech.wav', { shared: VOICE_TOKEN }))).status, 503);
  // And the install's own allowance was not charged for the refusal.
  assert.deepEqual(await store.read([usedKey()]), [8_000]);
});

test('the day has a ceiling on model calls too', async () => {
  process.env.ECHO_DAILY_MODEL_CALLS = '4';
  // A transcription reserves two calls (it and one second step) before it starts, and settles at
  // what it made: one. So with four a day, three are served (1, 2, 3 made) and the fourth, which
  // would need room for two more, is not.
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await transcribe(upload(wavOf(500), 'speech.wav', { install: tokenFor(INSTALL) }))).status, 200);
  }
  assert.equal((await transcribe(upload(wavOf(500), 'speech.wav', { install: tokenFor(INSTALL) }))).status, 503);
});
