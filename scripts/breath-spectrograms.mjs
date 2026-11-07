// Spectrograms of the Breathe sound, to look at before committing it.
//
//   node scripts/breath-spectrograms.mjs <output-dir>
//
// One PNG per file in assets/breathe/sound. A loop is drawn twice end to end, so its loop point is
// in the middle (marked by a notch on the top edge): a click shows as a bright vertical line there.
// Under the full view, a close view of that loop point, or of a bell's strike. A dotted line marks
// 4 kHz: the loops should be dark above it. Frequencies run 0 to 11 kHz, linearly, from the bottom.
import { Buffer } from 'node:buffer';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'assets/breathe/sound';
const out = process.argv[2];
if (!out) throw new Error('Usage: node scripts/breath-spectrograms.mjs <output-dir>');
mkdirSync(out, { recursive: true });

const WIDTH = 1400;
const FLOOR_DB = -110;
const CEILING_DB = -10;
const INFERNO = [
  [0, 0, 4],
  [40, 11, 84],
  [101, 21, 110],
  [159, 42, 99],
  [212, 72, 66],
  [245, 125, 21],
  [250, 193, 39],
  [252, 255, 164],
];

function readWav(path) {
  const buf = readFileSync(path);
  const rate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  if (bits !== 16 || buf.readUInt16LE(22) !== 1) throw new Error(`${path}: expected 16-bit mono`);
  let offset = 12;
  while (buf.toString('ascii', offset, offset + 4) !== 'data')
    offset += 8 + buf.readUInt32LE(offset + 4);
  const length = buf.readUInt32LE(offset + 4) / 2;
  const samples = new Float64Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = buf.readInt16LE(offset + 8 + i * 2) / 32768;
  return { rate, samples };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k += 1) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const ar = re[i + k + len / 2];
        const ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi;
        const ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - tr;
        im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr;
        im[i + k] += ti;
      }
    }
  }
}

/** Columns of dB magnitudes, `columns` wide, over `samples`, with a Hann window of `size`. */
function spectrogram(samples, size, columns) {
  const window = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  );
  const norm = window.reduce((sum, w) => sum + w, 0) / 2;
  const hop = Math.max(1, (samples.length - size) / Math.max(1, columns - 1));
  const result = [];
  for (let c = 0; c < columns; c += 1) {
    const start = Math.round(c * hop);
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i += 1) re[i] = (samples[start + i] ?? 0) * window[i];
    fft(re, im);
    const column = new Float64Array(size / 2);
    for (let k = 0; k < size / 2; k += 1) {
      column[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) / norm + 1e-12);
    }
    result.push(column);
  }
  return result;
}

function colour(db) {
  const t = Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)));
  const x = t * (INFERNO.length - 1);
  const i = Math.min(INFERNO.length - 2, Math.floor(x));
  const f = x - i;
  return INFERNO[i].map((v, k) => Math.round(v + (INFERNO[i + 1][k] - v) * f));
}

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 3, 18);
  }
  set(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
  }
}

function drawSpectrogram(
  canvas,
  top,
  height,
  samples,
  rate,
  size,
  columns,
  marks,
  maxHz = rate / 2,
) {
  const cols = spectrogram(samples, size, columns);
  const bins = Math.round((size / 2) * (maxHz / (rate / 2)));
  cols.forEach((column, x) => {
    for (let y = 0; y < height; y += 1) {
      // Each row shows the loudest bin it covers, so a thin line is never lost.
      const from = Math.floor(((height - 1 - y) / height) * bins);
      const to = Math.max(from + 1, Math.floor(((height - y) / height) * bins));
      let db = -Infinity;
      for (let k = from; k < to; k += 1) db = Math.max(db, column[k]);
      canvas.set(x, top + y, colour(db));
    }
  });
  // Guides: 4 kHz on the full views, and every 250 Hz on the low view.
  const guides =
    maxHz > 4000
      ? [4000]
      : Array.from({ length: Math.floor(maxHz / 250) }, (_, i) => (i + 1) * 250);
  for (const hz of guides) {
    const y = top + height - 1 - Math.round((hz / maxHz) * height);
    for (let x = 0; x < columns; x += 6) canvas.set(x, y, [120, 200, 255]);
  }
  for (const mark of marks) {
    for (let d = 0; d < 6; d += 1) {
      for (let dx = -d; dx <= d; dx += 1) canvas.set(mark + dx, top + 5 - d, [120, 255, 160]);
    }
  }
}

function drawWave(canvas, top, height, samples, columns) {
  const mid = top + height / 2;
  const guide = (height / 2) * 10 ** (-6 / 20);
  for (let x = 0; x < columns; x += 3) {
    canvas.set(x, Math.round(mid - guide), [90, 90, 90]);
    canvas.set(x, Math.round(mid + guide), [90, 90, 90]);
  }
  const per = samples.length / columns;
  for (let x = 0; x < columns; x += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (
      let i = Math.floor(x * per);
      i < Math.max(Math.floor((x + 1) * per), Math.floor(x * per) + 1);
      i += 1
    ) {
      const v = samples[i] ?? 0;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    for (
      let y = Math.round(mid - hi * (height / 2));
      y <= Math.round(mid - lo * (height / 2));
      y += 1
    ) {
      canvas.set(x, y, [200, 205, 215]);
    }
  }
}

for (const file of readdirSync(SOURCE)
  .filter((f) => f.endsWith('.wav'))
  .sort()) {
  const { rate, samples } = readWav(join(SOURCE, file));
  const loop = !file.startsWith('bell');
  const shown = loop
    ? Float64Array.from({ length: samples.length * 2 }, (_, i) => samples[i % samples.length])
    : samples;
  // The close view: a loop's loop point, or a bell's strike.
  const span = Math.round(0.35 * rate);
  const centre = loop ? samples.length : 0;
  const close = shown.slice(Math.max(0, centre - span), centre + span);
  const closeMark = loop ? [Math.round((span / close.length) * WIDTH)] : [];

  // Full view, its wave, the low end (0 to 1.5 kHz, where the tone and the hum live), then the close
  // view and its wave.
  const canvas = new Canvas(WIDTH, 300 + 4 + 70 + 10 + 240 + 10 + 200 + 4 + 70);
  drawSpectrogram(canvas, 0, 300, shown, rate, 1024, WIDTH, loop ? [WIDTH / 2] : []);
  drawWave(canvas, 304, 70, shown, WIDTH);
  drawSpectrogram(canvas, 384, 240, shown, rate, 4096, WIDTH, [], 1500);
  drawSpectrogram(canvas, 634, 200, close, rate, 256, WIDTH, closeMark);
  drawWave(canvas, 838, 70, close, WIDTH);
  const target = join(out, `${basename(file, '.wav')}.png`);
  await sharp(canvas.data, { raw: { width: canvas.width, height: canvas.height, channels: 3 } })
    .png()
    .toFile(target);
  console.log(target);
}
