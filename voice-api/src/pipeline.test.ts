import assert from 'node:assert/strict';
import { test } from 'node:test';

import { plausible, polish, run, transcribe, VoiceError, type Config } from './pipeline.js';

const audio = { bytes: new Uint8Array([1, 2, 3]), filename: 'a.m4a', type: 'audio/mp4' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const config = (handler: (url: string, init?: RequestInit) => Response): Config => ({
  apiKey: 'test',
  transcribeModel: 'gpt-transcribe',
  polishModel: 'polish',
  fetch: (async (url: string, init?: RequestInit) => handler(String(url), init)) as typeof fetch,
});
const said = reply.bind(null, 200, { text: 'um so I feel heavy', languages: [{ code: 'en' }], usage: { seconds: 9 } });
const cleaned = (text: string) => reply(200, { output: [{ type: 'message', content: [{ text }] }] });

test('returns the polished text and keeps the raw transcript', async () => {
  const result = await run(audio, config((url) => (url.endsWith('/responses') ? cleaned('So I feel heavy.') : said())));
  assert.deepEqual(result, { text: 'So I feel heavy.', raw: 'um so I feel heavy', polished: true, languages: ['en'], seconds: 9 });
});

test('never loses words: a failed cleanup falls back to the raw transcript', async () => {
  const result = await run(audio, config((url) => (url.endsWith('/responses') ? reply(500, {}) : said())));
  assert.equal(result.text, 'um so I feel heavy');
  assert.equal(result.polished, false);
});

test('rejects a cleanup that lost most of what was said', async () => {
  const raw = 'I said a great many things today that matter a lot to me and they are all still true';
  assert.equal(await polish(raw, config(() => cleaned('Things matter.'))), null);
  assert.equal(plausible('', 'anything'), false);
});

test('asks OpenAI not to store the cleanup, and marks the transcript as data', async () => {
  let sent: { store?: boolean; input?: string } = {};
  await polish('hello there', config((_url, init) => {
    sent = JSON.parse(String(init?.body));
    return cleaned('Hello there.');
  }));
  assert.equal(sent.store, false);
  assert.ok(sent.input?.startsWith('<transcript>'));
});

test('an upstream outage is retryable, and bad audio is not', async () => {
  await assert.rejects(transcribe(audio, config(() => reply(503, {}))), (e: VoiceError) => e.code === 'upstream' && e.retryable);
  await assert.rejects(transcribe(audio, config(() => reply(400, {}))), (e: VoiceError) => e.code === 'unsupported_audio' && !e.retryable);
});

test('silence is reported, not saved as an empty entry', async () => {
  await assert.rejects(run(audio, config(() => reply(200, { text: '  ' }))), (e: VoiceError) => e.code === 'empty');
});
