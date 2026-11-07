#!/usr/bin/env node
/**
 * The voice of Breathe. Every line ECHO speaks in a practice is made once with OpenAI's text to
 * speech, brought to one loudness, encoded as mono AAC and bundled with the app, so the practices
 * work offline and every line sounds like the same calm guide.
 *
 * The lines live in src/features/breathe/library/practices.ts and nowhere else. Change a line there,
 * then run:
 *
 *   OPENAI_API_KEY="$(cat <key file>)" node scripts/generate-breath-voice.mjs
 *       Makes the lines whose words, voice or processing changed, removes lines that are gone, and
 *       rewrites assets/breathe/voice/manifest.json and src/features/breathe/library/voiceLines.ts.
 *   ... --force             Makes every line again.
 *   ... --models            Lists the speech and transcription models the key can use, newest first.
 *   ... --samples <dir>     Three lines in each alternative voice (and in the chosen one, to compare),
 *       [--voices a,b]      written to <dir>, which must be outside the repo. Samples are for choosing
 *       [--lines id,id]     a voice by ear and are never bundled. --model tries another speech model,
 *       [--model m] [--raw] and --raw keeps each unprocessed take beside its sample.
 *
 * Each line:
 *   1. is spoken by SPEECH_MODEL in VOICE, steered by INSTRUCTIONS, as 16 bit WAV;
 *   2. is written down again by TRANSCRIBE_MODEL, and a take whose words differ from the line (a word
 *      added, dropped or swapped) is made again, up to MAX_TAKES times, as is a take of a breathing
 *      line that would run past the out breath it starts on (src/features/breathe/library/timing.ts);
 *   3. has its silence trimmed to EDGE_SECONDS at each end, with short fades;
 *   4. is brought to TARGET_LUFS integrated (ITU-R BS.1770-4), with a look ahead limiter holding
 *      sample peaks at CEILING_DBFS or lower, checked again after encoding;
 *   5. is encoded as mono AAC at BITRATE in .m4a by macOS afconvert.
 *
 * The key is read from the environment and used only in the Authorization header. It is never
 * printed, logged or written, and anything shaped like a key is scrubbed from error messages.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The voice. Chosen on 2026-11-08 from what GET /v1/models offered; see docs/BREATHE_SOURCES.md.
// The speech model is a dated snapshot, so the same words always come back in the same voice.
let SPEECH_MODEL = 'gpt-4o-mini-tts-2025-12-15';
const VOICE = 'shimmer';
const ALTERNATIVE_VOICES = ['cedar', 'marin'];
const TRANSCRIBE_MODEL = 'gpt-transcribe';
const INSTRUCTIONS = [
  'Voice affect: warm, low and soft. A calm guide sitting with one person in a quiet room at night.',
  'Tone: kind, plain and steady. Never bright or cheerful, never performed, never sing song, never a whisper.',
  'Pacing: slow and unhurried, clearly slower than conversation. Let each word land before the next.',
  'Pauses: a gentle pause at every comma, and a longer one at every full stop.',
  'Pronunciation: clear and soft, with relaxed endings.',
  'Emotion: quiet reassurance for someone who may be tired or anxious.',
].join('\n');

// The processing. Raise PROCESSING whenever the steps below change, so every line is made again.
const PROCESSING = 1;
const TARGET_LUFS = -20;
const CEILING_DBFS = -3;
const EDGE_SECONDS = 0.15;
const FADE_IN_SECONDS = 0.05;
const FADE_OUT_SECONDS = 0.08;
const BITRATE = 64000;
const MAX_TAKES = 3;

const SAMPLE_LINES = ['settle.open', 'one-thing.room', 'soothe.kind'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const voiceDir = path.join(root, 'assets/breathe/voice');
const manifestPath = path.join(voiceDir, 'manifest.json');
const practicesPath = path.join(root, 'src/features/breathe/library/practices.ts');
const timingPath = path.join(root, 'src/features/breathe/library/timing.ts');
const voiceLinesPath = path.join(root, 'src/features/breathe/library/voiceLines.ts');

// ---------------------------------------------------------------------------------------------
// The API

function apiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('Set OPENAI_API_KEY in the environment to reach OpenAI.');
  return key;
}

/** Removes anything shaped like a key, so an error message can be shown safely. */
function scrub(text) {
  const key = process.env.OPENAI_API_KEY?.trim();
  let clean = String(text).replace(/sk-[A-Za-z0-9_*.-]{4,}/g, 'sk-[hidden]');
  if (key) clean = clean.split(key).join('[hidden]');
  return clean;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, init = {}) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(`https://api.openai.com/v1${pathname}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${apiKey()}` },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      if (attempt < 4) {
        await wait(2000 * attempt);
        continue;
      }
      throw new Error(`OpenAI ${pathname} could not be reached: ${scrub(error.message)}`);
    }
    if (response.ok) return response;
    const body = scrub(await response.text()).slice(0, 600);
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await wait(4000 * attempt);
      continue;
    }
    throw new Error(`OpenAI ${pathname} answered ${response.status}: ${body}`);
  }
}

async function listModels() {
  const response = await api('/models');
  const { data } = await response.json();
  const audio = data
    .filter((model) => /tts|speech|transcribe|whisper|audio/i.test(model.id))
    .sort((a, b) => b.created - a.created);
  for (const model of audio) {
    console.log(`${new Date(model.created * 1000).toISOString().slice(0, 10)}  ${model.id}`);
  }
}

async function speak(text, voice) {
  const response = await api('/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: SPEECH_MODEL,
      voice,
      input: text,
      instructions: INSTRUCTIONS,
      response_format: 'wav',
    }),
  });
  return Buffer.from(await response.arrayBuffer());
}

async function transcribe(wav) {
  const form = new FormData();
  form.append('model', TRANSCRIBE_MODEL);
  form.append('language', 'en');
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'line.wav');
  const response = await api('/audio/transcriptions', { method: 'POST', body: form });
  const { text } = await response.json();
  return text;
}

// ---------------------------------------------------------------------------------------------
// Words: what the line says against what the take says

const NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

export function words(text) {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) && Number(word) <= 10 ? NUMBERS[Number(word)] : word))
    .map((word) => (word === 'ok' ? 'okay' : word));
}

const sameWords = (a, b) => words(a).join(' ') === words(b).join(' ');

// ---------------------------------------------------------------------------------------------
// Audio

export function readWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('The speech did not come back as WAV.');
  }
  let offset = 12;
  let format;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    let size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      let code = buffer.readUInt16LE(start);
      // WAVE_FORMAT_EXTENSIBLE keeps the real format in the first two bytes of its sub format.
      if (code === 0xfffe && size >= 26) code = buffer.readUInt16LE(start + 24);
      format = {
        code,
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      // A streamed WAV may give its data size as 0xFFFFFFFF; the data then runs to the end.
      if (size === 0xffffffff || start + size > buffer.length) size = buffer.length - start;
      if (!format) throw new Error('WAV data came before its format.');
      return {
        sampleRate: format.sampleRate,
        samples: decode(buffer.subarray(start, start + size), format),
      };
    }
    offset = start + size + (size % 2);
  }
  throw new Error('The WAV had no data.');
}

function decode(data, { code, channels, bits }) {
  const frames = Math.floor(data.length / (channels * (bits / 8)));
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const at = (frame * channels + channel) * (bits / 8);
      if (code === 1 && bits === 16) sum += data.readInt16LE(at) / 32768;
      else if (code === 3 && bits === 32) sum += data.readFloatLE(at);
      else if (code === 1 && bits === 24) sum += data.readIntLE(at, 3) / 8388608;
      else throw new Error(`WAV format ${code} at ${bits} bits is not read here.`);
    }
    samples[frame] = sum / channels;
  }
  return samples;
}

/** 32 bit float, mono. afconvert reads it without loss. */
export function writeWav(samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 4);
  samples.forEach((sample, index) => data.writeFloatLE(sample, index * 4));
  const header = Buffer.alloc(58);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(50 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(18, 16);
  header.writeUInt16LE(3, 20); // IEEE float
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(32, 34);
  header.writeUInt16LE(0, 36);
  header.write('fact', 38, 'ascii');
  header.writeUInt32LE(4, 42);
  header.writeUInt32LE(samples.length, 46);
  header.write('data', 50, 'ascii');
  header.writeUInt32LE(data.length, 54);
  return Buffer.concat([header, data]);
}

function biquad(input, b, a) {
  const output = new Float64Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let n = 0; n < input.length; n++) {
    const x = input[n];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    output[n] = y;
  }
  return output;
}

/** The K weighting of ITU-R BS.1770-4 at any sample rate (the derivation libebur128 uses). */
function kWeighted(samples, sampleRate) {
  let f0 = 1681.974450955533;
  let q = 0.7071752369554196;
  let k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = 10 ** (3.999843853973347 / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + k / q + k * k;
  const shelf = biquad(
    samples,
    [(vh + (vb * k) / q + k * k) / a0, (2 * (k * k - vh)) / a0, (vh - (vb * k) / q + k * k) / a0],
    [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0],
  );
  f0 = 38.13547087602444;
  q = 0.5003270373238773;
  k = Math.tan((Math.PI * f0) / sampleRate);
  const b0 = 1 + k / q + k * k;
  return biquad(shelf, [1, -2, 1], [1, (2 * (k * k - 1)) / b0, (1 - k / q + k * k) / b0]);
}

/** Integrated loudness in LUFS, gated as BS.1770-4 sets out, for one channel. */
export function integratedLoudness(samples, sampleRate) {
  const weighted = kWeighted(samples, sampleRate);
  const block = Math.round(0.4 * sampleRate);
  const hop = Math.round(0.1 * sampleRate);
  const prefix = new Float64Array(weighted.length + 1);
  for (let n = 0; n < weighted.length; n++) prefix[n + 1] = prefix[n] + weighted[n] * weighted[n];
  const powers = [];
  for (let start = 0; start + block <= weighted.length; start += hop) {
    powers.push((prefix[start + block] - prefix[start]) / block);
  }
  const lufs = (power) => -0.691 + 10 * Math.log10(power);
  const mean = (list) => list.reduce((sum, power) => sum + power, 0) / list.length;
  const absolute = powers.filter((power) => lufs(power) > -70);
  if (absolute.length === 0) return -Infinity;
  const relative = lufs(mean(absolute)) - 10;
  return lufs(mean(absolute.filter((power) => lufs(power) > relative)));
}

export function peakDbfs(samples) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return 20 * Math.log10(peak);
}

/** Keeps EDGE_SECONDS of the take's own quiet before the first sound and after the last. */
export function trimmed(samples, sampleRate) {
  const frame = Math.round(0.01 * sampleRate);
  const levels = [];
  for (let start = 0; start < samples.length; start += frame) {
    const end = Math.min(start + frame, samples.length);
    let sum = 0;
    for (let n = start; n < end; n++) sum += samples[n] * samples[n];
    levels.push(Math.sqrt(sum / (end - start)));
  }
  const threshold = Math.max(...levels) * 10 ** (-40 / 20);
  const first = levels.findIndex((level) => level > threshold);
  const last = levels.findLastIndex((level) => level > threshold);
  const edge = Math.round(EDGE_SECONDS * sampleRate);
  const onset = first * frame;
  const offset = Math.min(samples.length, (last + 1) * frame);
  const output = new Float32Array(offset - onset + 2 * edge);
  for (let n = 0; n < output.length; n++) {
    const source = onset - edge + n;
    output[n] = source >= 0 && source < samples.length ? samples[source] : 0;
  }
  return output;
}

function faded(samples, sampleRate) {
  const output = Float32Array.from(samples);
  const fadeIn = Math.round(FADE_IN_SECONDS * sampleRate);
  const fadeOut = Math.round(FADE_OUT_SECONDS * sampleRate);
  for (let n = 0; n < fadeIn; n++) output[n] *= 0.5 - 0.5 * Math.cos((Math.PI * n) / fadeIn);
  for (let n = 0; n < fadeOut; n++) {
    output[output.length - 1 - n] *= 0.5 - 0.5 * Math.cos((Math.PI * n) / fadeOut);
  }
  return output;
}

/**
 * Applies a gain, then holds every sample at or under the ceiling. The gain each sample needs is
 * taken as the least over a window either side of it, then averaged over the same window, so the
 * gain is smooth and never above what any sample in reach needs; it recovers over about 60 ms.
 */
export function limited(samples, sampleRate, gain, ceilingDbfs) {
  const ceiling = 10 ** (ceilingDbfs / 20);
  const reach = Math.round(0.005 * sampleRate);
  const length = samples.length;
  const needed = new Float64Array(length);
  for (let n = 0; n < length; n++) {
    const level = Math.abs(samples[n] * gain);
    needed[n] = level > ceiling ? ceiling / level : 1;
  }
  const least = new Float64Array(length);
  for (let n = 0; n < length; n++) {
    let min = 1;
    for (let m = Math.max(0, n - reach); m <= Math.min(length - 1, n + reach); m++) {
      if (needed[m] < min) min = needed[m];
    }
    least[n] = min;
  }
  const output = new Float32Array(length);
  const recovery = 1 - Math.exp(-1 / (0.06 * sampleRate));
  let held = 1;
  for (let n = 0; n < length; n++) {
    let sum = 0;
    let count = 0;
    for (let m = Math.max(0, n - reach); m <= Math.min(length - 1, n + reach); m++) {
      sum += least[m];
      count++;
    }
    held = Math.min(sum / count, held + (1 - held) * recovery);
    output[n] = samples[n] * gain * held;
  }
  return output;
}

/** One loudness for every line, with peaks under the ceiling. */
export function normalised(samples, sampleRate, ceilingDbfs = CEILING_DBFS) {
  let gain = 10 ** ((TARGET_LUFS - integratedLoudness(samples, sampleRate)) / 20);
  let output = limited(samples, sampleRate, gain, ceilingDbfs);
  for (let pass = 0; pass < 6; pass++) {
    const error = TARGET_LUFS - integratedLoudness(output, sampleRate);
    if (Math.abs(error) < 0.05) break;
    gain *= 10 ** (error / 20);
    output = limited(samples, sampleRate, gain, ceilingDbfs);
  }
  return output;
}

function afconvert(args) {
  execFileSync('afconvert', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/**
 * Trims, fades, normalises and encodes one take, then decodes the encoding and checks its peak,
 * because AAC can overshoot the samples it was given.
 */
function master(wav, outPath, scratch) {
  const { sampleRate, samples } = readWav(wav);
  const shaped = trimmed(samples, sampleRate);
  let ceiling = CEILING_DBFS - 0.5;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ready = faded(normalised(shaped, sampleRate, ceiling), sampleRate);
    const wavPath = path.join(scratch, 'master.wav');
    writeFileSync(wavPath, writeWav(ready, sampleRate));
    rmSync(outPath, { force: true });
    afconvert([
      '-f',
      'm4af',
      '-d',
      'aac',
      '-b',
      String(BITRATE),
      '-c',
      '1',
      '-q',
      '127',
      wavPath,
      outPath,
    ]);
    const checkPath = path.join(scratch, 'check.wav');
    afconvert(['-f', 'WAVE', '-d', 'LEF32', outPath, checkPath]);
    const decoded = readWav(readFileSync(checkPath)).samples;
    const peak = peakDbfs(decoded);
    if (peak <= CEILING_DBFS) {
      return {
        seconds: Math.round((ready.length / sampleRate) * 100) / 100,
        lufs: Math.round(integratedLoudness(decoded, sampleRate) * 10) / 10,
        peakDbfs: Math.round(peak * 10) / 10,
      };
    }
    ceiling -= peak - CEILING_DBFS + 0.2;
  }
  throw new Error(
    `${path.basename(outPath)} kept peaking over ${CEILING_DBFS} dBFS after encoding.`,
  );
}

// ---------------------------------------------------------------------------------------------
// Lines, files and records

/**
 * Every line's words by id, and for each breathing line the shortest out breath it starts on, at
 * any of Heart's paces: a take must end inside it, because the voice never speaks over a breath in.
 */
async function loadLines() {
  // The library is TypeScript with type only imports, which Node runs as is. Its module type is
  // found by syntax, and Node's note about that is not useful here.
  const emitWarning = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const code = typeof rest[0] === 'object' ? rest[0]?.code : rest[1];
    if (code !== 'MODULE_TYPELESS_PACKAGE_JSON') emitWarning.call(process, warning, ...rest);
  };
  const { PRACTICES, ARRIVE, IMAGERY_LINES } = await import(pathToFileURL(practicesPath).href);
  const { schedule, HEART_PACE } = await import(pathToFileURL(timingPath).href);
  process.emitWarning = emitWarning;
  const rooms = new Map();
  for (const practice of [...PRACTICES, ARRIVE]) {
    for (const pace of [HEART_PACE.slowest, HEART_PACE.default, HEART_PACE.fastest]) {
      for (const { line, room } of schedule(practice, { pace }).spoken) {
        if (!IMAGERY_LINES.has(line)) rooms.set(line, Math.min(rooms.get(line) ?? room, room));
      }
    }
  }
  const lines = new Map();
  for (const practice of [...PRACTICES, ARRIVE]) {
    for (const step of practice.steps) {
      if (step.kind !== 'voice') continue;
      if (!/^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/.test(step.line)) {
        throw new Error(`Line id "${step.line}" should look like "practice.word".`);
      }
      const known = lines.get(step.line);
      if (known !== undefined && known !== step.text) {
        throw new Error(`Line ${step.line} has two different texts.`);
      }
      lines.set(step.line, step.text);
    }
  }
  return { lines, rooms };
}

/** File names keep to a to z, digits and underscores, which Android resources need. */
export const fileFor = (line) => `${line.replace(/[^a-z0-9]+/g, '_')}.m4a`;

function settings(voice = VOICE) {
  return {
    speechModel: SPEECH_MODEL,
    voice,
    instructions: INSTRUCTIONS,
    transcribeModel: TRANSCRIBE_MODEL,
    processing: PROCESSING,
    targetLufs: TARGET_LUFS,
    ceilingDbfs: CEILING_DBFS,
    edgeSeconds: EDGE_SECONDS,
    bitrate: BITRATE,
  };
}

const hashOf = (text, voice = VOICE) =>
  createHash('sha256')
    .update(JSON.stringify({ text, ...settings(voice) }))
    .digest('hex')
    .slice(0, 16);

function readManifest() {
  if (!existsSync(manifestPath)) return { settings: settings(), lines: {} };
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

async function formatted(source, filePath) {
  const prettier = await import('prettier');
  const options = (await prettier.resolveConfig(filePath)) ?? {};
  return prettier.format(source, { ...options, filepath: filePath });
}

async function writeOutputs(manifest) {
  const ids = Object.keys(manifest.lines).sort();
  const lines = Object.fromEntries(ids.map((id) => [id, manifest.lines[id]]));
  writeFileSync(
    manifestPath,
    await formatted(JSON.stringify({ settings: settings(), lines }, null, 2), manifestPath),
  );
  const entries = ids
    .map((id) => `  '${id}': require('../../../../assets/breathe/voice/${lines[id].file}'),`)
    .join('\n');
  const source = `// Made by scripts/generate-breath-voice.mjs from the lines in practices.ts. Do not edit by hand:
// change a line's text in practices.ts and run the script, which makes only the lines that changed.

/** Every line ECHO speaks in Breathe, by line id, as a bundled audio asset. */
export const VOICE_LINES: Record<string, number> = {
${entries}
};
`;
  writeFileSync(voiceLinesPath, await formatted(source, voiceLinesPath));
}

/**
 * Speaks a line until a take says exactly the line's words and, for a breathing line, ends inside
 * its out breath (`room`, in seconds), then masters it. Takes of the same words vary by a second or
 * more, so a take that runs long is simply made again.
 */
async function makeLine(id, text, voice, outPath, scratch, room) {
  for (let take = 1; take <= MAX_TAKES; take++) {
    const wav = await speak(text, voice);
    const heard = await transcribe(wav);
    if (!sameWords(heard, text)) {
      console.log(`  ${id}: take ${take} said "${heard.trim()}", making it again`);
      continue;
    }
    // Mastered beside the scratch files, so a take that fails never replaces a good file.
    const takePath = path.join(scratch, 'take.m4a');
    const measured = master(wav, takePath, scratch);
    const spoken = measured.seconds - EDGE_SECONDS;
    if (room !== undefined && spoken > room) {
      console.log(
        `  ${id}: take ${take} runs ${spoken.toFixed(2)} s, over its ${room} s breath out`,
      );
      continue;
    }
    copyFileSync(takePath, outPath);
    return { ...measured, takes: take, wav };
  }
  throw new Error(
    `${id} did not come out as written, within its breath out, in ${MAX_TAKES} takes. ` +
      'If takes keep running long, the line has too many words for its breath.',
  );
}

async function generate({ force }) {
  if (process.platform !== 'darwin') throw new Error('Encoding needs macOS afconvert.');
  const { lines, rooms } = await loadLines();
  mkdirSync(voiceDir, { recursive: true });
  const manifest = readManifest();
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'echo-breath-voice-'));
  let made = 0;
  try {
    for (const [id, text] of lines) {
      const file = fileFor(id);
      const hash = hashOf(text);
      const known = manifest.lines[id];
      if (!force && known?.hash === hash && existsSync(path.join(voiceDir, file))) continue;
      const out = path.join(voiceDir, file);
      const measured = await makeLine(id, text, VOICE, out, scratch, rooms.get(id));
      const bytes = readFileSync(path.join(voiceDir, file)).length;
      manifest.lines[id] = {
        text,
        hash,
        file,
        seconds: measured.seconds,
        lufs: measured.lufs,
        peakDbfs: measured.peakDbfs,
        bytes,
      };
      made++;
      console.log(
        `${id}: ${measured.seconds} s, ${measured.lufs} LUFS, peak ${measured.peakDbfs} dBFS, ${bytes} bytes` +
          (measured.takes > 1 ? `, ${measured.takes} takes` : ''),
      );
      await writeOutputs(manifest);
    }
    for (const id of Object.keys(manifest.lines)) {
      if (lines.has(id)) continue;
      rmSync(path.join(voiceDir, manifest.lines[id].file), { force: true });
      delete manifest.lines[id];
      console.log(`${id}: removed`);
    }
    const wanted = new Set([...lines.keys()].map(fileFor));
    for (const file of readdirSync(voiceDir)) {
      if (file.endsWith('.m4a') && !wanted.has(file)) rmSync(path.join(voiceDir, file));
    }
    await writeOutputs(manifest);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const total = Object.values(manifest.lines).reduce((sum, line) => sum + line.bytes, 0);
  console.log(
    `${made} made, ${lines.size - made} unchanged, ${lines.size} lines, ${(total / 1024).toFixed(0)} KB in all.`,
  );
}

async function samples(dir, voices, ids, keepRaw) {
  const out = path.resolve(dir);
  if (out === root || out.startsWith(root + path.sep)) {
    throw new Error('Samples are written outside the repo, so they are never bundled.');
  }
  const { lines } = await loadLines();
  mkdirSync(out, { recursive: true });
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'echo-breath-voice-'));
  try {
    for (const voice of voices) {
      for (const id of ids) {
        const text = lines.get(id);
        if (text === undefined) throw new Error(`There is no line ${id}.`);
        const file = path.join(out, `${voice}-${fileFor(id)}`);
        const measured = await makeLine(id, text, voice, file, scratch);
        if (keepRaw) writeFileSync(file.replace(/\.m4a$/, '.raw.wav'), measured.wav);
        console.log(`${voice} ${id}: ${measured.seconds} s, ${measured.lufs} LUFS -> ${file}`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  if (process.argv.includes('--models')) return listModels();
  const sampleDir = option('--samples');
  if (sampleDir) {
    // Another speech model may be tried here, by ear, before it is chosen above.
    SPEECH_MODEL = option('--model') ?? SPEECH_MODEL;
    const voices = option('--voices')?.split(',') ?? [...ALTERNATIVE_VOICES, VOICE];
    const ids = option('--lines')?.split(',') ?? SAMPLE_LINES;
    return samples(sampleDir, voices, ids, process.argv.includes('--raw'));
  }
  return generate({ force: process.argv.includes('--force') });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(scrub(error.message));
    process.exit(1);
  });
}
