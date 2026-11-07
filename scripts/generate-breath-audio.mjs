// The sound of Breathe: a seamless one-round loop for every breath pattern the practices use, and
// three soft bells. Plain Node and deterministic: running it again writes the same bytes.
//
//   node scripts/generate-breath-audio.mjs
//
// Output: assets/breathe/sound/*.wav, 16-bit PCM mono at 22.05 kHz. To check them by eye, render
// spectrograms with `node scripts/breath-spectrograms.mjs <dir>` and look for clicks, hiss and
// harsh highs before committing.
//
// Every loop is exactly one round. It begins as the in breath begins and ends at the end of the
// round, the quietest moment, where it flows back into its own start. The app maps the player's
// position in the file straight onto the round, so the phase times below are the contract with
// src/features/breathe: change one and the other must change with it.
//
// The sound, in layers, all following one breath envelope (raised cosine segments, no corners):
// - A sea swell: pink noise through a low pass whose cutoff and gain rise as the lungs fill. A hold
//   is a held hush, softening a little while the breath waits.
// - A warm tone beneath it: a low root and its fifth, with soft octaves, gliding up a little on the
//   in breath and back on the out. The same root in every loop, so all of them are one instrument.
// - For the humming breath, a closed-lips hum on that root through the out breath.
import { Buffer } from 'node:buffer';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 22050;
const OUT = 'assets/breathe/sound';

// The loops: name, then phases in milliseconds. `to` is how full an in breath leaves the lungs.
const LOOPS = [
  {
    name: 'sigh',
    phases: [
      // The first breath in settles for a moment before the short second one, and the swell holds a
      // little back for it, so the second breath is heard as a swell of its own.
      { action: 'inhale', ms: 2500, to: 0.8, sound: 0.64, rise: 0.86 },
      { action: 'inhale', ms: 1000, to: 1 },
      { action: 'exhale', ms: 6000 },
    ],
  },
  // The library's sighs (src/features/breathe/library/practices.ts): a fuller first breath in, and
  // Settle's last minute with a longer breath out.
  ...[6000, 8000].map((exhale) => ({
    name: `sigh-3-1-${exhale / 1000}`,
    phases: [
      { action: 'inhale', ms: 3000, to: 0.8, sound: 0.64, rise: 0.86 },
      { action: 'inhale', ms: 1000, to: 1 },
      { action: 'exhale', ms: exhale },
    ],
  })),
  // Ground's lengthening out breath, Soothe's and Ready's settling steps, and Lift's quicker rounds.
  { name: 'paced-2-0-5-0', phases: paced(2000, 0, 5000, 0) },
  { name: 'paced-3-0-3-0', phases: paced(3000, 0, 3000, 0) },
  { name: 'paced-3-0-5-0', phases: paced(3000, 0, 5000, 0) },
  { name: 'paced-3-0-6-0', phases: paced(3000, 0, 6000, 0) },
  { name: 'paced-3-0-7-0', phases: paced(3000, 0, 7000, 0) },
  { name: 'paced-4-0-5-0', phases: paced(4000, 0, 5000, 0) },
  { name: 'paced-4-0-6-0-hum', phases: paced(4000, 0, 6000, 0), hum: true },
  { name: 'paced-4-0-6-0', phases: paced(4000, 0, 6000, 0) },
  { name: 'paced-4-0-8-0-hum', phases: paced(4000, 0, 8000, 0), hum: true },
  { name: 'paced-4-4-4-4', phases: paced(4000, 4000, 4000, 4000) },
  { name: 'paced-4-7-8-0', phases: paced(4000, 7000, 8000, 0) },
  { name: 'paced-4-0-8-0', phases: paced(4000, 0, 8000, 0) },
  { name: 'paced-4-0-4-0', phases: paced(4000, 0, 4000, 0) },
  ...[4.5, 5, 5.5, 6, 6.5].map((bpm) => ({
    name: `heart-${Math.round(bpm * 10)}`,
    phases: heart(bpm),
  })),
];

function paced(inhale, holdIn, exhale, holdOut) {
  return [
    { action: 'inhale', ms: inhale },
    ...(holdIn > 0 ? [{ action: 'hold', ms: holdIn }] : []),
    { action: 'exhale', ms: exhale },
    ...(holdOut > 0 ? [{ action: 'hold', ms: holdOut }] : []),
  ];
}

/** Heart coherence at a pace: in 40 percent and out 60 percent of each breath, no holds. */
function heart(breathsPerMinute) {
  const roundMs = Math.round(60000 / breathsPerMinute);
  const inhaleMs = Math.round(roundMs * 0.4);
  return [
    { action: 'inhale', ms: inhaleMs },
    { action: 'exhale', ms: roundMs - inhaleMs },
  ];
}

// The instrument. Levels are linear and relative: one gain for all the loops is set at the end.
const SWELL = { lowHz: 230, highHz: 1500, floor: 0.26, hush: 0.7, rumbleHz: 45 };
const TONE = { rootHz: 110, glide: 1.5, level: 0.05, lift: 0.3, beat: 4 };
const TONE_PARTIALS = [
  // [multiple of the root, amplitude]. 1.5 and 3 are the fifth and the fifth an octave up.
  [1, 1],
  [1.5, 0.62],
  [2, 0.22],
  [3, 0.08],
];
const HUM = { level: 0.13, fadeInMs: 1100, fadeOutMs: 1800, sag: 0.25, swellDip: 0.45 };
// A closed-lips "mmm": strong low harmonics, falling away fast above the nasal resonance.
const HUM_HARMONICS = [1, 0.78, 0.46, 0.24, 0.12, 0.065, 0.03, 0.015];
const CROSSFADE_MS = 450;
const PREROLL_MS = 1500;
const LOOP_PEAK_DB = -7.5;

// ---------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(name) {
  let h = 2166136261;
  for (const c of name) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pink noise, Paul Kellet's refined filter over white noise. */
function pinkNoise(rand) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  return () => {
    const white = rand() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    return out * 0.11;
  };
}

/** A state variable filter (Simper's trapezoidal form), stable while its cutoff moves. */
function svf(kind, q = Math.SQRT1_2) {
  let ic1 = 0;
  let ic2 = 0;
  const k = 1 / q;
  return (x, hz) => {
    const g = Math.tan((Math.PI * hz) / SR);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return kind === 'low' ? v2 : x - k * v1 - v2;
  };
}

const raised = (p) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, p)))) / 2;

/**
 * The breath, sample by sample over one round of `length` samples. `lungs` is how full they are,
 * for the tone's pitch. `sound` is the swell's level, which also softens into a hush while a breath
 * is held. Both are raised cosine segments, so they start and end every phase with no slope.
 */
function envelopes(phases, length) {
  const roundMs = phases.reduce((sum, p) => sum + p.ms, 0);
  const lungs = new Float64Array(length);
  const sound = new Float64Array(length);
  const exhales = [];
  let startMs = 0;
  let lung = 0;
  let level = 0;
  for (const phase of phases) {
    const from = Math.round((startMs / roundMs) * length);
    const to = Math.round(((startMs + phase.ms) / roundMs) * length);
    const lungTo =
      phase.action === 'inhale' ? (phase.to ?? 1) : phase.action === 'exhale' ? 0 : lung;
    const levelTo =
      phase.action === 'inhale'
        ? (phase.sound ?? lungTo)
        : phase.action === 'exhale'
          ? 0
          : level > 0.05
            ? level * SWELL.hush
            : level;
    // `rise` is the share of the phase the change takes. The rest of the phase holds still.
    const span = (to - from) * (phase.rise ?? 1);
    for (let n = from; n < to; n += 1) {
      const p = raised((n - from) / span);
      lungs[n] = lung + (lungTo - lung) * p;
      sound[n] = level + (levelTo - level) * p;
    }
    if (phase.action === 'exhale') exhales.push([from, to]);
    lung = lungTo;
    level = levelTo;
    startMs += phase.ms;
  }
  return { lungs, sound, exhales, roundMs };
}

/** The hum's level over the round: in at each exhale's start, out by its end, sagging as it goes. */
function humEnvelope(exhales, length) {
  const env = new Float64Array(length);
  const fadeIn = Math.round((HUM.fadeInMs / 1000) * SR);
  const fadeOut = Math.round((HUM.fadeOutMs / 1000) * SR);
  for (const [from, to] of exhales) {
    const span = to - from;
    for (let n = from; n < to; n += 1) {
      const i = n - from;
      const rise = raised(i / fadeIn);
      const fall = raised((to - n) / fadeOut);
      env[n] = rise * fall * (1 - HUM.sag * (i / span));
    }
  }
  return env;
}

function renderLoop(loop) {
  const roundMs = loop.phases.reduce((sum, p) => sum + p.ms, 0);
  const length = Math.round((roundMs * SR) / 1000);
  const { lungs, sound, exhales } = envelopes(loop.phases, length);
  const hum = loop.hum ? humEnvelope(exhales, length) : null;
  const rand = mulberry32(seedOf(loop.name));

  // The swell, rendered on past the end of the round and folded back into its start, so the loop
  // point is the continuation of the sound and not a cut.
  const fade = Math.round((CROSSFADE_MS / 1000) * SR);
  const preroll = Math.round((PREROLL_MS / 1000) * SR);
  const total = preroll + length + fade;
  const noise = pinkNoise(rand);
  const rumble = svf('high');
  const lowA = svf('low');
  const lowB = svf('low');
  const swell = new Float64Array(length + fade);
  for (let i = 0; i < total; i += 1) {
    const n = (((i - preroll) % length) + length) % length;
    const level = sound[n] * (hum ? 1 - HUM.swellDip * hum[n] : 1);
    const hz = SWELL.lowHz * (SWELL.highHz / SWELL.lowHz) ** level;
    const gain = SWELL.floor + (1 - SWELL.floor) * level;
    const x = lowB(lowA(rumble(noise(), SWELL.rumbleHz), hz), hz) * gain;
    if (i >= preroll) swell[i - preroll] = x;
  }
  const out = new Float64Array(length);
  for (let n = 0; n < length; n += 1) {
    if (n < fade) {
      const t = (n / fade) * (Math.PI / 2);
      out[n] = swell[n] * Math.sin(t) + swell[length + n] * Math.cos(t);
    } else {
      out[n] = swell[n];
    }
  }

  // The tone. Its root is nudged by a hair so that every partial makes a whole number of cycles in
  // the round, even while it glides, which makes it seamless without any crossfade.
  let glideSum = 0;
  for (let n = 0; n < length; n += 1) glideSum += 2 ** ((TONE.glide * lungs[n]) / 12);
  const cycles = 2 * Math.round((TONE.rootHz * glideSum) / SR / 2); // even, so the fifth is whole
  const root = (cycles * SR) / glideSum;
  let phase = 0;
  for (let n = 0; n < length; n += 1) {
    const e = lungs[n];
    const amp = TONE.level * (1 - TONE.lift + TONE.lift * e);
    let tone = 0;
    for (const [multiple, a] of TONE_PARTIALS) tone += a * Math.sin(2 * Math.PI * multiple * phase);
    // A slow beating on the root, a whole number of beats a round.
    tone += 0.18 * Math.sin(2 * Math.PI * (phase + (TONE.beat * n) / length));
    out[n] += amp * tone;
    if (hum && hum[n] > 0) {
      // A little life in the voice: a slow, small waver in pitch.
      const waver = 0.06 * Math.sin((2 * Math.PI * 4.6 * n) / SR);
      let voice = 0;
      for (let k = 0; k < HUM_HARMONICS.length; k += 1) {
        voice += HUM_HARMONICS[k] * Math.sin(2 * Math.PI * (k + 1) * (phase + waver));
      }
      out[n] += HUM.level * hum[n] * voice;
    }
    // Never wrapped: the fifth is 1.5 times the root, so a wrapped phase would jump.
    phase += (root * 2 ** ((TONE.glide * e) / 12)) / SR;
  }
  return { name: loop.name, samples: out, roundMs, root, cycles };
}

// ---------------------------------------------------------------------------------------------
// Bells: a small singing bowl. Inharmonic partials, each a close pair that beats slowly, decaying
// at their own rates, struck with a soft mallet.

const BOWL = [
  // [ratio to the fundamental, amplitude, seconds to fall by 60 dB, beat in Hz]
  [1, 1, 7.5, 0.7],
  [2.76, 0.42, 4.2, 1.6],
  [5.4, 0.16, 2.4, 2.3],
  [8.93, 0.05, 1.4, 3.1],
];
const STRIKE_MS = 14;

function strike(out, at, hz, gain, decay, rand) {
  const start = Math.round(at * SR);
  const attack = Math.round((STRIKE_MS / 1000) * SR);
  for (const [ratio, amp, t60, beat] of BOWL) {
    const f = hz * ratio;
    if (f > 4800) continue;
    const tau = (t60 * decay) / Math.log(1000);
    const p1 = rand() * 2 * Math.PI;
    const p2 = rand() * 2 * Math.PI;
    for (let n = start; n < out.length; n += 1) {
      const t = (n - start) / SR;
      const env = raised((n - start) / attack) * Math.exp(-t / tau);
      if (env < 1e-6 && n - start > attack) break;
      const pair =
        0.56 * Math.sin(2 * Math.PI * (f - beat / 2) * t + p1) +
        0.44 * Math.sin(2 * Math.PI * (f + beat / 2) * t + p2);
      out[n] += gain * amp * env * pair;
    }
  }
}

function renderBell({ name, seconds, strikes, peakDb }) {
  const out = new Float64Array(Math.round(seconds * SR));
  const rand = mulberry32(seedOf(name));
  for (const s of strikes) strike(out, s.at, s.hz, s.gain, s.decay, rand);
  // The last breath of the tail goes to true silence.
  const tail = Math.round(0.8 * SR);
  for (let i = 0; i < tail; i += 1) out[out.length - tail + i] *= 1 - raised(i / tail);
  normalise(out, peakDb);
  return { name, samples: out };
}

const BELLS = [
  {
    name: 'bell-open',
    seconds: 6.5,
    peakDb: -6.5,
    strikes: [{ at: 0, hz: 440, gain: 1, decay: 1 }],
  },
  { name: 'bell', seconds: 4.5, peakDb: -9, strikes: [{ at: 0, hz: 660, gain: 1, decay: 0.62 }] },
  {
    name: 'bell-close',
    seconds: 7.5,
    peakDb: -7,
    strikes: [
      { at: 0, hz: 440, gain: 0.85, decay: 0.8 },
      { at: 1.5, hz: 330, gain: 1, decay: 1 },
    ],
  },
];

// ---------------------------------------------------------------------------------------------

const peakOf = (samples) => samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
const dbOf = (amp) => 20 * Math.log10(Math.max(amp, 1e-12));

function normalise(samples, peakDb) {
  const gain = 10 ** (peakDb / 20) / peakOf(samples);
  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Quietest and loudest 50 ms of a file, by RMS, in dBFS. */
function rmsRange(samples) {
  const win = Math.round(0.05 * SR);
  let low = Infinity;
  let high = -Infinity;
  for (let start = 0; start + win <= samples.length; start += win) {
    let sum = 0;
    for (let i = start; i < start + win; i += 1) sum += samples[i] ** 2;
    const db = dbOf(Math.sqrt(sum / win));
    low = Math.min(low, db);
    high = Math.max(high, db);
  }
  return [low, high];
}

function quantised(samples) {
  return Int16Array.from(samples, (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767));
}

/** How the step across the loop point compares with the steps between neighbouring samples. */
function seam(samples) {
  const q = quantised(samples);
  const steps = [];
  for (let i = 1; i < q.length; i += 1) steps.push(Math.abs(q[i] - q[i - 1]));
  steps.sort((a, b) => a - b);
  return {
    step: Math.abs(q[0] - q[q.length - 1]),
    p99: steps[Math.floor(steps.length * 0.99)],
    max: steps[steps.length - 1],
  };
}

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) if (file.endsWith('.wav')) rmSync(join(OUT, file));

const loops = LOOPS.map(renderLoop);
// One gain for every loop, so they are one instrument at one loudness and switching never jumps.
const loudest = Math.max(...loops.map((l) => peakOf(l.samples)));
const loopGain = 10 ** (LOOP_PEAK_DB / 20) / loudest;
for (const loop of loops)
  for (let i = 0; i < loop.samples.length; i += 1) loop.samples[i] *= loopGain;
const bells = BELLS.map(renderBell);

const rows = [];
let bytes = 0;
for (const file of [...loops, ...bells]) {
  const body = wav(file.samples);
  writeFileSync(join(OUT, `${file.name}.wav`), body);
  bytes += body.length;
  const dc = file.samples.reduce((sum, x) => sum + x, 0) / file.samples.length;
  const [quiet, loud] = rmsRange(file.samples);
  const row = {
    file: `${file.name}.wav`,
    samples: file.samples.length,
    seconds: +(file.samples.length / SR).toFixed(3),
    kb: Math.round(body.length / 1024),
    peakDb: +dbOf(peakOf(file.samples)).toFixed(2),
    dc: +dc.toExponential(1),
    rmsQuietDb: +quiet.toFixed(1),
    rmsLoudDb: +loud.toFixed(1),
  };
  if (file.roundMs) {
    const s = seam(file.samples);
    Object.assign(row, {
      roundMs: file.roundMs,
      seamStep: s.step,
      stepP99: s.p99,
      stepMax: s.max,
      rootHz: +file.root.toFixed(3),
      firstSample: quantised(file.samples)[0],
    });
  }
  rows.push(row);
}
console.table(rows);
console.log(`Total: ${(bytes / 1024 / 1024).toFixed(2)} MB in ${rows.length} files, ${OUT}`);
