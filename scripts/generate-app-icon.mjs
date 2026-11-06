// Generates the INTERIM app icon set into assets/app/ from the locked wordmark:
// the cream ECHO wordmark on Night navy. The final icon is an open owner decision
// (docs/DECISIONS_REQUIRED.md); replace the PNGs, not the wiring, when it is made.
// Run with `node scripts/generate-app-icon.mjs`. Uses Playwright (to draw the wordmark in its own
// typeface) and sharp, both already dev dependencies.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const NAVY = '#13263A'; // Night navy
const CREAM = '#F7F3EB'; // night textPrimary
const SIZE = 1024;
// Android keeps the central 66% of an adaptive icon layer on every launcher mask, and the Android 12
// splash screen shows the central 66% of its square. The wordmark is wide and short, so it is sized
// to sit inside the circle of that diameter, not just inside the square.
const SAFE_DIAMETER = Math.round(SIZE * 0.66);
const MARK_WIDTH = 600;
const NOTIFICATION_SIZE = 96;
const NOTIFICATION_MARK = 88;

const outDir = 'assets/app';
mkdirSync(outDir, { recursive: true });

// Chrome adds letter-spacing after the last letter too, so the locked SVG's centred text lands half a
// letter-space (6 units) left of its centred rule. The app places each letter on its own to avoid
// exactly this (src/components/TrackedText.tsx) and the golden shows the rule centred under the
// letters, so the text is moved right by half the letter-spacing here. Nothing else is changed.
const wordmark = readFileSync('product-handoff/assets/icons/echo-wordmark.svg', 'utf8').replace(
  'x="90" y="29"',
  'x="96" y="29"',
);
if (!wordmark.includes('x="96"')) throw new Error('echo-wordmark.svg changed; update this script');
const font = readFileSync(
  'node_modules/@expo-google-fonts/cormorant-garamond/400Regular/CormorantGaramond_400Regular.ttf',
).toString('base64');

/** The locked wordmark SVG, drawn in `colour`, on a transparent background, at 16x. */
async function renderWordmark(colour) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 180, height: 48 },
      deviceScaleFactor: 16,
    });
    await page.setContent(
      `<style>
        @font-face { font-family: 'Cormorant Garamond'; font-weight: 400;
          src: url(data:font/ttf;base64,${font}) format('truetype'); }
        html, body { margin: 0; background: transparent; color: ${colour}; }
        svg { display: block; }
      </style>${wordmark}`,
    );
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ omitBackground: true });
  } finally {
    await browser.close();
  }
}

/** The mark trimmed to its ink, scaled to MARK_WIDTH wide, as a PNG buffer. */
async function mark(colour) {
  const drawn = await renderWordmark(colour);
  return sharp(drawn)
    .trim({ background: '#00000000', threshold: 1 })
    .resize({ width: MARK_WIDTH, kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

/** `markPng` centred on a SIZE square, over `background` (or transparent). */
async function onCanvas(markPng, background) {
  const { width, height } = await sharp(markPng).metadata();
  const diagonal = Math.hypot(width, height);
  if (diagonal > SAFE_DIAMETER) {
    throw new Error(
      `mark diagonal ${diagonal.toFixed(0)} leaves the ${SAFE_DIAMETER}px safe circle`,
    );
  }
  // An opaque canvas has no alpha channel at all, which the App Store requires of the icon.
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: background ? 3 : 4,
      background: background ?? '#00000000',
    },
  }).composite([
    { input: markPng, left: Math.round((SIZE - width) / 2), top: Math.round((SIZE - height) / 2) },
  ]);
}

const cream = await mark(CREAM);
const white = await mark('#FFFFFF');

// Store / iOS icon: opaque, no alpha.
await (await onCanvas(cream, NAVY)).removeAlpha().png().toFile(`${outDir}/icon.png`);
// Android adaptive layers. The background colour (NAVY) is set in app.json.
await (await onCanvas(cream)).png().toFile(`${outDir}/adaptive-foreground.png`);
await (await onCanvas(white)).png().toFile(`${outDir}/adaptive-monochrome.png`);
// Splash mark: transparent, same geometry, so the Android 12 circular mask never clips it.
await (await onCanvas(cream)).png().toFile(`${outDir}/splash-mark.png`);

// Android draws a notification's small icon from its alpha alone, so this one is a white shape.
const small = await sharp(white)
  .resize({ width: NOTIFICATION_MARK, kernel: 'lanczos3' })
  .png()
  .toBuffer();
await sharp({
  create: {
    width: NOTIFICATION_SIZE,
    height: NOTIFICATION_SIZE,
    channels: 4,
    background: '#00000000',
  },
})
  .composite([{ input: small, gravity: 'centre' }])
  .png()
  .toFile(`${outDir}/notification-icon.png`);

console.log('wrote 5 PNGs to', outDir);
