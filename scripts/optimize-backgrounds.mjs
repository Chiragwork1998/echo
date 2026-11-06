// Builds the app's background plates from the 1290x2796 production masters.
// Usage: node scripts/optimize-backgrounds.mjs <folder of NN-screen-theme.png masters>
//
// The goldens sit each plate lower than a centred cover would, which leaves titles in open sky.
// scripts/plate-placement.json holds that position per screen. Where moving a plate down opens a
// gap at the top, the existing sky tapers smoothly into it, so there is no seam to see, and the
// bottom rows drop off behind the CTA. Home also bakes in the goldens' depth of field. See docs/SPEC_CONFLICTS.md, C-06.
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [masters] = process.argv.slice(2);
if (!masters) throw new Error('Pass the masters folder');
const placement = JSON.parse(readFileSync('scripts/plate-placement.json', 'utf8'));
const WIDTH = 1290;
const HEIGHT = 2796;
const PX_PER_PT = WIDTH / 393;
const MAX_TAPER = 0.3 * HEIGHT;
sharp.concurrency(2);

async function place(file, { scale, dx, dy, depth }) {
  const scaledW = Math.round(WIDTH * scale);
  const scaledH = Math.round(HEIGHT * scale);
  const { data } = await sharp(file)
    .resize(scaledW, scaledH, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const left = Math.round((scaledW - WIDTH) / 2 - dx * PX_PER_PT);
  const offsetY = (HEIGHT - scaledH) / 2 + dy * PX_PER_PT;
  const gap = Math.max(0, offsetY);
  const taper = gap > 0 ? Math.min(gap * 6, MAX_TAPER) : 0;
  const a = gap > 0 ? 1 - (2 * gap) / taper : 1;
  const b = gap > 0 ? gap / (taper * taper) : 0;

  const out = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    // Rows inside the taper read from a compressed band of sky. Below it the plate is untouched.
    const source = y < taper ? a * y + b * y * y : y - offsetY;
    const low = Math.max(0, Math.min(scaledH - 1, Math.floor(source)));
    const high = Math.min(scaledH - 1, low + 1);
    const t = source - Math.floor(source);
    for (let x = 0; x < WIDTH; x += 1) {
      const from = (low * scaledW + x + left) * 3;
      const to = (high * scaledW + x + left) * 3;
      const at = (y * WIDTH + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        out[at + c] = data[from + c] * (1 - t) + data[to + c] * t;
      }
    }
  }
  const placed = sharp(out, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } });
  return depth ? addDepthOfField(await placed.png().toBuffer(), depth) : placed;
}

/** Melts the foreground into a soft, darker blur, as a lens would. Above `from` nothing changes. */
async function addDepthOfField(plate, { from, to, sigma, darken }) {
  const raw = { width: WIDTH, height: HEIGHT, channels: 3 };
  const sharp8 = (input) => sharp(input).removeAlpha().raw().toBuffer();
  const [source, soft] = await Promise.all([
    sharp8(plate),
    sharp8(await sharp(plate).blur(sigma).png().toBuffer()),
  ]);
  const start = Math.round(from * HEIGHT);
  const end = Math.round(to * HEIGHT);
  for (let y = start; y < HEIGHT; y += 1) {
    const t = Math.min(1, (y - start) / (end - start));
    const mix = t * t * (3 - 2 * t);
    const dim = 1 - darken * mix;
    for (let i = y * WIDTH * 3; i < (y + 1) * WIDTH * 3; i += 1) {
      source[i] = (source[i] * (1 - mix) + soft[i] * mix) * dim;
    }
  }
  return sharp(source, { raw });
}

let total = 0;
for (const file of readdirSync(masters)
  .filter((f) => f.endsWith('.png'))
  .sort()) {
  const match = /^(\d\d)-([a-z-]+)-(day|night)\.png$/.exec(file);
  if (!match) throw new Error(`Unexpected master name: ${file}`);
  const [, order, screen, theme] = match;
  const dir = join('assets/backgrounds', theme);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${order}-${screen}.webp`);
  const placed = await place(join(masters, file), placement[theme][screen]);
  await placed.webp({ quality: 88, smartSubsample: true, effort: 6 }).toFile(target);
  total += statSync(target).size;
}
console.log(`total ${(total / 1048576).toFixed(1)} MB`);
