// Generates assets/app/notification-icon.png, Android's small notification icon: the E of the ECHO
// wordmark with its hairline, the same mark as the site's favicon, so the store, the site and the
// notification shade show one ECHO mark. Pure white on transparent, because Android draws a small
// icon from its alpha alone, 96 x 96 (24 dp at 4x), with the mark inside the central 20 of 24 dp.
// The disc's colour is set in app.json (expo-notifications, `color`), and is Night's gold.
//
// Run with `node scripts/generate-notification-icon.mjs`. Uses Playwright (to draw the E in its own
// typeface) and sharp, both already dev dependencies. It writes this one file and nothing else.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const OUT = 'assets/app/notification-icon.png';
const SIZE = 96;
// Android keeps a small icon's glyph inside the central 20 of its 24 dp.
const LIVE = Math.round((SIZE * 20) / 24);
// The favicon's tile, drawn large so the reduction to 96 pixels is the only rounding.
const TILE = 960;

// The favicon is the source (docs/launch/store-graphics/favicon.html): its markup and every one of
// its proportions are used as they are. Three things change: the brand serif comes from the app's
// own dependency, the mark is white, and there is no navy tile behind it.
const favicon = readFileSync('docs/launch/store-graphics/favicon.html', 'utf8');
const style = /<style>([\s\S]*?)<\/style>/.exec(favicon)?.[1];
const tile = /<div class="tile" id="tile">[\s\S]*?<\/div>/.exec(favicon)?.[0];
const SITE_FONT = /src: url\('[^']*cormorant-garamond-latin\.woff2'\) format\('woff2'\);/;
if (!style || !tile || !SITE_FONT.test(style) || !style.includes('font-weight: 600;')) {
  throw new Error('favicon.html changed; update this script');
}
// The favicon sets its E in weight 600, so this is the SemiBold.
const font = readFileSync(
  'node_modules/@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf',
).toString('base64');
const css = style
  .replace(SITE_FONT, `src: url(data:font/ttf;base64,${font}) format('truetype');`)
  .replaceAll('#13263a', 'transparent')
  .replaceAll('#f7f3eb', '#ffffff');
if (/#13263a|#f7f3eb/i.test(css))
  throw new Error('favicon.html changed its colours; update this script');

/** The favicon's tile at TILE pixels, white on transparent. */
async function drawTile() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: TILE, height: TILE } });
    await page.setContent(
      `<!doctype html><html><head><style>${css}</style></head><body>${tile}</body></html>`,
    );
    await page.evaluate((size) => {
      document.getElementById('tile')?.style.setProperty('--size', `${size}px`);
    }, TILE);
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => document.fonts.check('600 10px "Cormorant Garamond"'));
    if (!loaded) throw new Error('Cormorant Garamond did not load');
    return await page.locator('#tile').screenshot({ omitBackground: true });
  } finally {
    await browser.close();
  }
}

const drawn = await drawTile();
// The mark trimmed to its ink, then made as large as the live area allows. Catmull-Rom, not Lanczos:
// Lanczos rings, and at this size its ripples are faint ghost lines beside the hairline and the
// arms, which Android, drawing from the alpha alone, would show.
const ink = await sharp(drawn).trim({ background: '#00000000', threshold: 1 }).png().toBuffer();
const { width = 0, height = 0 } = await sharp(ink).metadata();
const scale = LIVE / Math.max(width, height);
const mark = await sharp(ink)
  .resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    kernel: 'cubic',
  })
  .png()
  .toBuffer();
const placed = await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: '#00000000' },
})
  .composite([{ input: mark, gravity: 'centre' }])
  .png()
  .toBuffer();
// Pure white wherever there is ink: only the alpha carries the shape, so no edge brings a tint.
const alpha = await sharp(placed).extractChannel('alpha').png().toBuffer();
await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: '#ffffff' } })
  .joinChannel(alpha)
  .png()
  .toFile(OUT);

console.log(
  `wrote ${OUT}: the favicon's E and hairline, ${width} x ${height} drawn, fitted to ${LIVE}`,
);
