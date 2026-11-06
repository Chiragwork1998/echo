import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { POST as transcribe } from '../api/transcribe.js';

const TOKEN = 'test-token';
const realFetch = globalThis.fetch;
const realBinary = process.env.ECHO_FFMPEG;

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.ECHO_VOICE_TOKEN = TOKEN;
  mock.method(console, 'log', () => undefined);
  globalThis.fetch = (async () =>
    Response.json({ text: 'I am here.', languages: [], usage: { seconds: 2 } })) as typeof fetch;
});
afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = realFetch;
  if (realBinary === undefined) delete process.env.ECHO_FFMPEG;
  else process.env.ECHO_FFMPEG = realBinary;
});

const upload = (ip: string) => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'take.aac', { type: 'audio/aac' }));
  return new Request('http://x/api/transcribe', {
    method: 'POST',
    headers: { 'x-echo-voice-token': TOKEN, 'x-forwarded-for': ip },
    body: form,
  });
};

test('a flood of Android takes is answered with try again, not with a stalled server', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'echo-route-'));
  const slow = join(dir, 'slow.sh');
  writeFileSync(slow, '#!/bin/sh\ncat > /dev/null\nsleep 0.6\nprintf flac\n');
  chmodSync(slow, 0o755);
  process.env.ECHO_FFMPEG = slow;

  const responses = await Promise.all(
    Array.from({ length: 12 }, (_, i) => transcribe(upload(`10.1.0.${i}`))),
  );
  const busy = responses.filter((response) => response.status === 503);
  const served = responses.filter((response) => response.status === 200);
  assert.ok(busy.length >= 1, 'some were turned away');
  assert.ok(served.length >= 1, 'some were served');
  assert.equal(busy.length + served.length, 12);
  assert.deepEqual(await busy[0]!.json(), { code: 'busy', retryable: true });
});
