// Renders screens and compares them with the goldens.
//   npm run visual -- --screen intent --theme day    one screen
//   npm run visual                                   everything
//   npm run visual -- --skip-build                   reuse the last web build
// Output: .artifacts/visual/<theme>-<screen>.png with four panels: Golden, Ours, Overlay, Diff.
// Open that image and judge it with your eyes. The percentage is a guide, not the verdict.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values: args } = parseArgs({
  options: {
    screen: { type: 'string' },
    theme: { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    'empty-state': { type: 'boolean', default: false },
    suffix: { type: 'string', default: '' },
  },
});

const webDir = '.artifacts/web';
const outDir = '.artifacts/visual';
mkdirSync(outDir, { recursive: true });
const manifest = JSON.parse(readFileSync('product-handoff/data/screen-manifest.json', 'utf8'));
const crops = JSON.parse(readFileSync('scripts/visual/crops.json', 'utf8'));

const screens = manifest.screens.filter((s) => !args.screen || s.id === args.screen);
const themes = ['day', 'night'].filter((t) => !args.theme || t === args.theme);
if (!screens.length) throw new Error(`Unknown screen: ${args.screen}`);

// Metro plus Chromium peak near 3 GB, and agents run in parallel on a 16 GB Mac. One run at a time,
// across every worktree.
const lock = join(tmpdir(), 'echo-visual.lock');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const release = () => rmSync(lock, { recursive: true, force: true });
for (;;) {
  try {
    mkdirSync(lock);
    break;
  } catch {
    if (Date.now() - statSync(lock).mtimeMs > 10 * 60 * 1000) release();
    else await sleep(2000);
  }
}
process.on('exit', release);

if (!args['skip-build'] || !existsSync(join(webDir, 'index.html'))) {
  console.log('Building web bundle...');
  const build = spawnSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', webDir], {
    env: { ...process.env, EXPO_PUBLIC_QA: '1', NODE_OPTIONS: '--max-old-space-size=2048' },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    console.error(build.stdout.slice(-3000), build.stderr.slice(-3000));
    process.exit(1);
  }
}

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};
const root = resolve(webDir);
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith('/__golden/')) {
    res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*' });
    res.end(readFileSync(normalize(`product-handoff/${path.slice('/__golden/'.length)}`)));
    return;
  }
  const file = join(root, path);
  const found = file.startsWith(root) && existsSync(file) && statSync(file).isFile();
  const target = found ? file : join(root, 'index.html');
  res.writeHead(200, { 'content-type': mime[extname(target)] ?? 'application/octet-stream' });
  res.end(readFileSync(target));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const report = [];
const failures = [];

for (const theme of themes) {
  for (const screen of screens) {
    const crop = crops[theme][screen.id];
    const viewport = { width: 393, height: 852 };
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
      colorScheme: theme === 'night' ? 'dark' : 'light',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    const fixture = args['empty-state'] ? '' : `&fixture=${screen.id}`;
    await page.goto(`${origin}${screen.route}?theme=${theme}${fixture}`);
    await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
      await document.fonts.ready;
    });
    await sleep(350);
    const shot = (await page.screenshot({ type: 'png' })).toString('base64');
    await context.close();

    const source = crop.source ?? `golden/${theme}/${screen.background}`;
    const sheet = await browser.newPage({
      viewport: { width: 1660, height: viewport.height + 40 },
    });
    const result = await sheet.evaluate(
      async ({ shot, crop, source, viewport, origin }) => {
        const load = async (src) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = src;
          await img.decode();
          return img;
        };
        const [ours, golden] = await Promise.all([
          load(`data:image/png;base64,${shot}`),
          load(`${origin}/__golden/${source}`),
        ]);
        const scale = 2;
        const W = viewport.width * scale;
        const H = viewport.height * scale;
        const canvas = () => {
          const c = document.createElement('canvas');
          c.width = W;
          c.height = H;
          return c;
        };
        const a = canvas().getContext('2d', { willReadFrequently: true });
        a.imageSmoothingQuality = 'high';
        a.drawImage(golden, crop.x, crop.y, crop.width, crop.height, 0, 0, W, H);
        const b = canvas().getContext('2d', { willReadFrequently: true });
        b.drawImage(ours, 0, 0, W, H);
        const da = a.getImageData(0, 0, W, H);
        const db = b.getImageData(0, 0, W, H);
        const diff = canvas().getContext('2d');
        const out = diff.createImageData(W, H);
        // Status bar and home indicator are presentation chrome in the goldens.
        const top = 59 * scale;
        const bottom = H - 34 * scale;
        let off = 0;
        let counted = 0;
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 4;
            const delta =
              Math.abs(da.data[i] - db.data[i]) +
              Math.abs(da.data[i + 1] - db.data[i + 1]) +
              Math.abs(da.data[i + 2] - db.data[i + 2]);
            const masked = y < top || y >= bottom;
            const hit = !masked && delta > 90;
            if (!masked) counted += 1;
            if (hit) off += 1;
            out.data[i] = hit ? 255 : da.data[i] / 4;
            out.data[i + 1] = hit ? 0 : da.data[i + 1] / 4;
            out.data[i + 2] = hit ? 90 : da.data[i + 2] / 4;
            out.data[i + 3] = 255;
          }
        }
        diff.putImageData(out, 0, 0);
        const overlay = canvas().getContext('2d');
        overlay.drawImage(a.canvas, 0, 0);
        overlay.globalAlpha = 0.5;
        overlay.drawImage(b.canvas, 0, 0);
        document.body.style.cssText = 'margin:0;background:#111;color:#ddd;font:13px system-ui';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;padding:8px';
        for (const [label, c] of [
          ['GOLDEN', a.canvas],
          ['OURS', b.canvas],
          ['OVERLAY 50%', overlay.canvas],
          ['DIFF', diff.canvas],
        ]) {
          const col = document.createElement('div');
          col.textContent = label;
          c.style.cssText = `display:block;width:${viewport.width}px;height:${viewport.height}px;margin-top:4px`;
          col.append(c);
          row.append(col);
        }
        document.body.append(row);
        return { mismatch: +((off / counted) * 100).toFixed(2) };
      },
      { shot, crop, source, viewport, origin },
    );
    const file = `${outDir}/${theme}-${screen.id}${args.suffix}.png`;
    await sheet.screenshot({ path: file });
    await sheet.close();
    report.push({ theme, screen: screen.id, ...result, viewport, file, errors });
    if (errors.length) failures.push(`${theme}/${screen.id}: ${errors[0]}`);
    console.log(
      `${theme.padEnd(5)} ${screen.id.padEnd(11)} ${String(result.mismatch).padStart(6)}%  ${file}${errors.length ? '  RUNTIME ERRORS' : ''}`,
    );
  }
}

await browser.close();
server.close();
writeFileSync(`${outDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error('\nRuntime errors:\n', failures.join('\n'));
  process.exit(1);
}
