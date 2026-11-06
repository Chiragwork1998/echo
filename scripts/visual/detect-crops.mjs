// Finds the real screen rectangle inside each golden PNG (they mix bezels, cards and full-bleed)
// and writes scripts/visual/crops.json. Re-run only if the goldens change; review contact-sheet.png.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('product-handoff/data/screen-manifest.json', 'utf8'));
const out = '.artifacts/visual';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const crops = {};

const detect = async (dataUrl) =>
  page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = img.naturalWidth,
      h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, w, h);
    const px = (x, y) => {
      const i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // Page backdrop is near-black and neutral, so a scene pixel is bright or coloured.
    const scene = (x, y) => {
      const [r, g2, b] = px(x, y);
      return Math.max(r, g2, b) > 34 || Math.max(r, g2, b) - Math.min(r, g2, b) > 14;
    };
    const corner = [
      [6, 6],
      [w - 7, 6],
      [6, h - 7],
      [w - 7, h - 7],
    ].every(([x, y]) => !scene(x, y));
    if (!corner) return { w, h, x: 0, y: 0, width: w, height: h, kind: 'full-bleed' };
    const median = (a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
    const run = 40; // must clear thin metallic bezel highlights
    const firstFrom = (len, at, rev) => {
      for (let i = 0; i < len - run; i += 1) {
        let ok = true;
        for (let k = 0; k < run && ok; k += 1) ok = at(rev ? len - 1 - i - k : i + k);
        if (ok) return rev ? len - 1 - i : i;
      }
      return rev ? len - 1 : 0;
    };
    // Sample many lines and take the outermost hit: dark rocks, night sky and the Dynamic Island
    // each defeat single samples, but cannot hide every line at once.
    const lines = (n, size) =>
      Array.from({ length: n }, (_, i) => Math.floor(size * (0.18 + (0.64 * i) / (n - 1))));
    const ys = lines(24, h);
    const xs = lines(24, w);
    const lo = (a) => a.sort((p, q) => p - q)[1];
    const hi = (a) => a.sort((p, q) => q - p)[1];
    const left = median(ys.map((y) => firstFrom(w, (x) => scene(x, y), false)));
    const right = median(ys.map((y) => firstFrom(w, (x) => scene(x, y), true)));
    const top = lo(xs.map((x) => firstFrom(h, (y) => scene(x, y), false)));
    const bottom = hi(xs.map((x) => firstFrom(h, (y) => scene(x, y), true)));
    return {
      w,
      h,
      x: left,
      y: top,
      width: right - left + 1,
      height: bottom - top + 1,
      kind: 'framed',
    };
  }, dataUrl);

for (const theme of ['day', 'night']) {
  crops[theme] = {};
  for (const s of manifest.screens) {
    const b64 = readFileSync(`product-handoff/golden/${theme}/${s.background}`).toString('base64');
    const r = await detect(`data:image/png;base64,${b64}`);
    // Steps 1-8 all sit in one phone mockup. Dark scenes can defeat detection, so use the
    // consensus rectangle. Landing (borderless cards) and Home (full-bleed) keep their own.
    const bezel = s.id !== 'landing' && r.kind === 'framed';
    crops[theme][s.id] = bezel
      ? { x: 74, y: 97, width: 721, height: 1591, kind: 'bezel' }
      : {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          kind: r.kind === 'framed' ? 'card' : r.kind,
        };
    console.log(
      theme.padEnd(5),
      s.id.padEnd(11),
      r.kind.padEnd(10),
      `x${r.x} y${r.y} ${r.width}x${r.height}`,
      (r.width / r.height).toFixed(3),
    );
  }
}
writeFileSync('scripts/visual/crops.json', `${JSON.stringify(crops, null, 2)}\n`);

// Contact sheet: every golden, cropped, with the crop edge outlined in magenta on the full image.
const tiles = [];
for (const theme of ['day', 'night'])
  for (const s of manifest.screens) {
    const c = crops[theme][s.id];
    const b64 = readFileSync(`product-handoff/golden/${theme}/${s.background}`).toString('base64');
    const sc = 170 / 868;
    tiles.push(
      `<div style="position:relative;width:170px;height:355px;background-size:170px;background-image:url(data:image/png;base64,${b64})"><div style="position:absolute;left:${c.x * sc}px;top:${c.y * sc}px;width:${c.width * sc}px;height:${c.height * sc}px;outline:1px solid #f0f"></div><span style="position:absolute;left:2px;bottom:2px;color:#0f0;font:10px sans-serif">${theme} ${s.id}</span></div>`,
    );
  }
await page.setViewportSize({ width: 1760, height: 730 });
await page.setContent(
  `<body style="margin:0;background:#333;display:grid;grid-template-columns:repeat(10,170px);gap:6px">${tiles.join('')}</body>`,
);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/contact-sheet.png` });
await browser.close();
