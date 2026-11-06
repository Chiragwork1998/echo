import assert from 'node:assert/strict';
import { test } from 'node:test';

import { delayOf, LIVE_URL, LiveError, mintLiveSession, secretBody } from './live.js';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const KEY = 'sk-test-never-returned';

test('mints a transcription secret and hands the phone only the secret', async () => {
  let sent: { url: string; auth: string | null; body: unknown } | null = null;
  const session = await mintLiveSession({
    apiKey: KEY,
    delay: 'low',
    fetch: (async (url: string, init?: RequestInit) => {
      sent = {
        url: String(url),
        auth: new Headers(init?.headers).get('authorization'),
        body: JSON.parse(String(init?.body)),
      };
      return reply(200, { value: 'ek_short_lived', expires_at: 1793946714 });
    }) as typeof fetch,
  });
  assert.equal(sent!.url, 'https://api.openai.com/v1/realtime/client_secrets');
  assert.equal(sent!.auth, `Bearer ${KEY}`);
  assert.deepEqual(sent!.body, secretBody());
  const body = secretBody();
  assert.equal(body.session.type, 'transcription');
  assert.equal(body.session.audio.input.format.rate, 24000);
  assert.equal(body.session.audio.input.transcription.model, 'gpt-live-transcribe');
  assert.equal(body.session.audio.input.turn_detection, null);

  assert.equal(session.url, LIVE_URL);
  assert.equal(session.secret, 'ek_short_lived');
  assert.equal(session.sampleRate, 24000);
  assert.ok(session.url.startsWith('wss://'));
  // The OpenAI key is never part of what the phone receives.
  assert.ok(!JSON.stringify(session).includes(KEY));
  const update = session.update as { type: string; session: { audio: { input: { transcription: { delay: string; prompt: string } } } } };
  assert.equal(update.type, 'session.update');
  assert.equal(update.session.audio.input.transcription.delay, 'low');
  assert.match(update.session.audio.input.transcription.prompt, /Keep every filler/);
});

test('a refused or empty reply is a failure that carries a code only', async () => {
  const mint = (status: number, body: unknown) =>
    mintLiveSession({ apiKey: KEY, delay: 'low', fetch: (async () => reply(status, body)) as typeof fetch });
  await assert.rejects(mint(500, {}), (e: LiveError) => e instanceof LiveError && e.retryable);
  await assert.rejects(mint(401, {}), (e: LiveError) => e instanceof LiveError && !e.retryable);
  await assert.rejects(mint(200, { value: '' }), (e: LiveError) => e instanceof LiveError);
  await assert.rejects(
    mintLiveSession({ apiKey: KEY, delay: 'low', fetch: (async () => { throw new Error('boom'); }) as typeof fetch }),
    (e: LiveError) => e instanceof LiveError && e.retryable && e.message === 'live_unavailable',
  );
});

test('an unknown delay setting means the default', () => {
  assert.equal(delayOf(undefined), 'low');
  assert.equal(delayOf('fast'), 'low');
  assert.equal(delayOf('minimal'), 'minimal');
});
