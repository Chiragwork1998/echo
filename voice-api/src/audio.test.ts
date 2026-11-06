import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { normalise } from './audio.js';
import { VoiceError } from './pipeline.js';

// ffmpeg is the one thing here that is not ours, and it takes whatever a phone sends it. These stand
// in for it with small scripts, so that a hang, a flood and a failure can be made to happen at will.

const dir = mkdtempSync(join(tmpdir(), 'echo-ffmpeg-'));
const script = (name: string, body: string) => {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
};
const pidFile = join(dir, 'pid');
const hang = script('hang.sh', `echo $$ > "${pidFile}"\nexec sleep 30`);
const quick = script('quick.sh', 'cat');
const holds = script('holds.sh', 'cat > /dev/null\nsleep 0.4\nprintf flac');
const flood = script('flood.sh', 'cat > /dev/null\nhead -c 3000000 /dev/zero');
const broken = script('broken.sh', 'cat > /dev/null\nexit 1');

const aac = (name = 'take.aac') => ({
  bytes: new Uint8Array([1, 2, 3, 4]),
  filename: name,
  type: 'audio/aac',
});
const realBinary = process.env.ECHO_FFMPEG;
const use = (binary: string) => void (process.env.ECHO_FFMPEG = binary);
beforeEach(() => use(quick));
afterEach(() => {
  if (realBinary === undefined) delete process.env.ECHO_FFMPEG;
  else process.env.ECHO_FFMPEG = realBinary;
});

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('an .aac becomes FLAC, and anything else goes through untouched', async () => {
  const done = await normalise(aac());
  assert.equal(done.filename, 'take.flac');
  assert.equal(done.type, 'audio/flac');
  assert.deepEqual([...done.bytes], [1, 2, 3, 4]);
  const m4a = { bytes: new Uint8Array([9]), filename: 'take.m4a', type: 'audio/mp4' };
  assert.equal(await normalise(m4a), m4a);
});

test('a conversion that hangs is killed when its time is up, and says to try again', async () => {
  use(hang);
  // Long enough for the first run of a new script, which macOS scans before it lets it start.
  const started = Date.now();
  await assert.rejects(normalise(aac(), { timeoutMs: 2_000 }), (error) => {
    assert.ok(error instanceof VoiceError);
    assert.equal(error.code, 'too_slow');
    assert.equal(error.retryable, true);
    return true;
  });
  assert.ok(Date.now() - started < 10_000, 'it did not wait for the process');
  // The process itself is gone, not left running after the request has been answered.
  const pid = Number(readFileSync(pidFile, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(alive(pid), false);
});

test('only a few conversions run at once, and the rest are told to try again', async () => {
  use(holds);
  const limits = { maxRunning: 2, timeoutMs: 5_000 };
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => normalise(aac(), limits)));
  const busy = results.filter(
    (result): result is PromiseRejectedResult =>
      result.status === 'rejected' && result.reason instanceof VoiceError,
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  assert.equal(busy.length, 2);
  for (const { reason } of busy) {
    assert.equal(reason.code, 'busy');
    assert.equal(reason.retryable, true);
  }
  // A slot is given back when its conversion ends, so the next one is taken.
  assert.equal((await normalise(aac(), limits)).filename, 'take.flac');
});

test('a slot is given back when a conversion fails, hangs, or cannot start', async () => {
  const limits = { maxRunning: 1, timeoutMs: 200 };
  use(broken);
  await assert.rejects(normalise(aac(), limits), /convert_failed/);
  use(join(dir, 'does-not-exist'));
  await assert.rejects(normalise(aac(), limits));
  use(hang);
  await assert.rejects(normalise(aac(), limits), (error) => error instanceof VoiceError && error.code === 'too_slow');
  use(quick);
  assert.equal((await normalise(aac(), limits)).type, 'audio/flac');
});

test('output larger than OpenAI would take stops the conversion, rather than fill the instance', async () => {
  use(flood);
  await assert.rejects(normalise(aac(), { maxOutputBytes: 1_000_000 }), (error) => {
    assert.ok(error instanceof VoiceError);
    assert.equal(error.code, 'unsupported_audio');
    assert.equal(error.retryable, false);
    return true;
  });
});
