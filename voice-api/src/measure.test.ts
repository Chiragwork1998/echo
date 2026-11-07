import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

import { adtsMs, measure, mp4Ms, wavMs } from './measure.js';
import { adtsFrames, fixture, wavBytes } from './testing.js';

// Every fixture is synthetic: macOS `say` reading a sentence written for these tests.

test('WAV: a live take at 24 kHz is counted to the sample', () => {
  // 61,798 samples at 24 kHz, which is what ffmpeg decodes from the same file.
  assert.deepEqual(measure(fixture('say-24k.wav'), 'speech.wav'), { ms: 2575, format: 'wav' });
  assert.equal(wavMs(wavBytes({ rate: 24000, samples: 24000 * 83 })), 83_000);
  assert.equal(wavMs(wavBytes({ rate: 16000, channels: 2, samples: 16000 })), 1_000);
  // A part of a millisecond counts as one.
  assert.equal(wavMs(wavBytes({ rate: 24000, samples: 1 })), 1);
});

test('WAV: a header that gives too little is not believed, so nothing after it goes uncounted', () => {
  const ten = wavBytes({ rate: 24000, samples: 24000 * 10 });
  // After a crash the app's own header can say zero, or lag the file (src/services/wav.ts).
  assert.equal(wavMs(wavBytes({ rate: 24000, samples: 24000 * 10, declared: 0 })), 10_000);
  assert.equal(wavMs(wavBytes({ rate: 24000, samples: 24000 * 10, declared: 4_800 })), 10_000);
  assert.equal(wavMs(ten), 10_000);
  // A header that claims more than the file holds counts what is there.
  assert.equal(wavMs(wavBytes({ rate: 24000, samples: 24000, declared: 999_999_999 })), 1_000);
});

test('WAV: formats that could hide sound are refused', () => {
  const twoFormats = (() => {
    const base = wavBytes({ rate: 48000, channels: 2, samples: 100 });
    // A second fmt chunk, at 8 kHz mono, between the first and the data.
    const extra = new Uint8Array(24);
    const view = new DataView(extra.buffer);
    [...'fmt '].forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
    view.setUint32(4, 16, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 1, true);
    view.setUint32(12, 8000, true);
    view.setUint32(16, 16000, true);
    view.setUint16(20, 2, true);
    view.setUint16(22, 16, true);
    return new Uint8Array([...base.subarray(0, 36), ...extra, ...base.subarray(36)]);
  })();
  assert.equal(wavMs(twoFormats), null);
  // Compressed (ADPCM, MP3 in WAV), and a block size that does not match the format.
  assert.equal(wavMs(wavBytes({ samples: 100, tag: 2 })), null);
  assert.equal(wavMs(wavBytes({ samples: 100, tag: 0x55 })), null);
  const lying = wavBytes({ samples: 100 });
  new DataView(lying.buffer).setUint16(32, 1, true);
  assert.equal(wavMs(lying), null);
  // A rate no phone records.
  assert.equal(wavMs(wavBytes({ rate: 1000, samples: 100 })), null);
  assert.equal(wavMs(new Uint8Array(400).fill(7)), null);
});

test('ADTS: Android takes are counted frame by frame, at the rate each frame gives', () => {
  // 42 frames at 16 kHz and 112 at 44.1 kHz, both what ffmpeg decodes from the same files.
  assert.deepEqual(measure(fixture('say-16k.aac'), 'speech.aac'), { ms: 2688, format: 'adts' });
  assert.deepEqual(measure(fixture('say-44k.aac'), 'speech.AAC'), { ms: 2601, format: 'adts' });
  assert.equal(adtsMs(adtsFrames(1000, 16000)), 64_000);
  assert.equal(adtsMs(adtsFrames(375, 48000)), 8_000);
  // A frame with two raw data blocks holds twice the sound.
  assert.equal(adtsMs(adtsFrames(500, 16000, 40, 2)), 64_000);
});

test('ADTS: junk before, between or after frames hides nothing, and a frame cut short still counts', () => {
  const frames = adtsFrames(250, 16000);
  const junk = new Uint8Array(37).fill(0x11);
  const half = frames.length / 2;
  const mixed = new Uint8Array([...junk, ...frames.subarray(0, half), ...junk, ...frames.subarray(half), ...junk]);
  assert.equal(adtsMs(mixed), adtsMs(frames));
  // The last frame is missing its last bytes, as a recording stopped by a crash would be.
  assert.equal(adtsMs(frames.subarray(0, frames.length - 10)), adtsMs(frames));
  // An ID3 tag at the start is passed over, as a decoder passes over it.
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20, ...new Array<number>(20).fill(0xff)]);
  assert.equal(adtsMs(new Uint8Array([...id3, ...frames])), adtsMs(frames));
  assert.equal(adtsMs(junk), null);
});

test('ADTS: the count agrees with what ffmpeg decodes, where ffmpeg is on this machine', (context) => {
  const ffmpeg = spawnSync('ffmpeg', ['-version']);
  if (ffmpeg.status !== 0) return context.skip('no ffmpeg on this machine');
  for (const name of ['say-16k.aac', 'say-44k.aac', 'say-24k.wav']) {
    const decoded = spawnSync(
      'ffmpeg',
      ['-hide_banner', '-i', join(import.meta.dirname, 'fixtures', name), '-map', '0:a:0', '-f', 's16le', '-ac', '1', '-'],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    const rate = Number(/(\d+) Hz/.exec(String(decoded.stderr))?.[1]);
    const samples = decoded.stdout.length / 2;
    assert.equal(measure(fixture(name), name)?.ms, Math.ceil((samples * 1000) / rate), name);
  }
});

test('MP4: an iOS .m4a is counted by its own timing table, and never less than it plays', () => {
  const measured = mp4Ms(fixture('say.m4a'));
  assert.ok(measured !== null);
  // ffmpeg plays 2,597.7 ms of it once the encoder's lead-in is trimmed. The table holds that lead-in
  // too, so the count is a little more, never less.
  assert.ok(measured >= 2598 && measured <= 2700, String(measured));
  // A fragmented file keeps its timing elsewhere, and is refused rather than guessed.
  const fragmented = new Uint8Array([0, 0, 0, 8, ...[...'moof'].map((c) => c.charCodeAt(0)), ...fixture('say.m4a')]);
  assert.equal(mp4Ms(fragmented), null);
  assert.equal(mp4Ms(new Uint8Array(64).fill(3)), null);
});

test('each array is read through its own range: a view into a larger buffer measures only itself', () => {
  // The bug class that once sent scraps of earlier audio to OpenAI: a small Buffer is a view into a
  // pool, and .buffer is the whole pool. Measuring must never read past the view's own bytes.
  const take = wavBytes({ rate: 24000, samples: 24000 });
  const decoy = wavBytes({ rate: 8000, samples: 8000 * 50 });
  const pool = new Uint8Array(decoy.length + take.length + 100);
  pool.set(decoy, 0);
  pool.set(take, decoy.length + 50);
  const view = pool.subarray(decoy.length + 50, decoy.length + 50 + take.length);
  assert.equal(wavMs(view), 1_000);
  const frames = adtsFrames(100);
  const pooled = Buffer.concat([Buffer.from(adtsFrames(900)), Buffer.from(frames)]).subarray(adtsFrames(900).length);
  assert.equal(adtsMs(pooled), 6_400);
  const m4a = fixture('say.m4a');
  const inside = new Uint8Array(m4a.length + 64);
  inside.set(m4a, 32);
  assert.equal(mp4Ms(inside.subarray(32, 32 + m4a.length)), mp4Ms(m4a));
});

test('the name decides how a file is read, and a format that cannot be measured is refused', () => {
  assert.equal(measure(fixture('say-16k.aac'), 'speech.wav'), null);
  assert.equal(measure(fixture('say-24k.wav'), 'speech.m4a'), null);
  assert.equal(measure(fixture('say-24k.wav'), 'speech.mp3'), null);
  assert.equal(measure(fixture('say-24k.wav'), 'speech.webm'), null);
  assert.equal(measure(fixture('say-24k.wav'), 'speech'), null);
});
