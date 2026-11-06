// Measures where each golden places its plate. Usage: node scripts/register-plates.cjs <masters>
// Writes scripts/plate-placement.json, which then needs the hand review noted in the docs.
// Scale stays >= 1 so a plate can never leave a gap at the sides. Windows avoid each screen's UI.
const sharp = require('sharp');
const fs = require('fs');
const crops = JSON.parse(fs.readFileSync('scripts/visual/crops.json'));
const screens = JSON.parse(fs.readFileSync('product-handoff/data/screen-manifest.json')).screens;
const masters = process.argv[2];
const W = 98;
const H = 213; // 1 unit = 4 pt
const windows = {
  landing: [[0.3, 0.8]],
  intent: [[0.34, 0.8]],
  horizon: [[0.34, 0.86]],
  voice: [[0.32, 0.86]],
  rhythm: [
    [0.2, 0.31],
    [0.76, 0.86],
  ],
  privacy: [[0.2, 0.66]],
  arrival: [[0.2, 0.84]],
  'first-echo': [[0.76, 0.88]],
  completion: [[0.3, 0.64]],
  home: [[0.3, 0.5]],
};
const gray = (s, w, h) => s.resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer();
(async () => {
  const out = {};
  for (const theme of ['day', 'night']) {
    out[theme] = {};
    for (const s of screens) {
      const c = crops[theme][s.id];
      const source = `product-handoff/${c.source ?? `golden/${theme}/${s.background}`}`;
      const box = {
        left: Math.round(c.x),
        top: Math.round(c.y),
        width: Math.round(c.width),
        height: Math.round(c.height),
      };
      const g = await gray(sharp(source, { failOn: 'none' }).extract(box), W, H);
      const plate = sharp(`${masters}/${s.background.replace('.png', '')}-${theme}.png`);
      const score = (p, pw, ph, dx, dy) => {
        let n = 0,
          sa = 0,
          sb = 0,
          saa = 0,
          sbb = 0,
          sab = 0;
        for (const [a0, a1] of windows[s.id]) {
          for (let y = Math.floor(H * a0); y < Math.floor(H * a1); y += 1) {
            for (let x = 3; x < W - 3; x += 1) {
              const px = x - dx,
                py = y - dy;
              if (px < 0 || py < 0 || px >= pw || py >= ph) continue;
              const a = g[y * W + x],
                b = p[py * pw + px];
              n += 1;
              sa += a;
              sb += b;
              saa += a * a;
              sbb += b * b;
              sab += a * b;
            }
          }
        }
        if (n < 400) return -1;
        const d = Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));
        return d ? (sab - (sa * sb) / n) / d : -1;
      };
      let best = { r: -2 };
      for (let sc = 1; sc <= 1.14; sc += 0.01) {
        const pw = Math.round(W * sc),
          ph = Math.round(H * sc);
        const p = await gray(plate.clone(), pw, ph);
        const cx = Math.round((W - pw) / 2),
          cy = Math.round((H - ph) / 2);
        for (let dy = -22; dy <= 22; dy += 1) {
          for (let dx = -6; dx <= 6; dx += 1) {
            const r = score(p, pw, ph, cx + dx, cy + dy);
            if (r > best.r) best = { r, scale: +sc.toFixed(2), dx: dx * 4, dy: dy * 4 };
          }
        }
      }
      out[theme][s.id] = best;
      console.log(
        theme.padEnd(5),
        s.id.padEnd(11),
        best.scale.toFixed(2),
        String(best.dx).padStart(4),
        String(best.dy).padStart(4),
        best.r.toFixed(3),
      );
    }
  }
  fs.writeFileSync('scripts/plate-placement.json', `${JSON.stringify(out, null, 2)}\n`);
})();
