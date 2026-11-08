// Android's small notification icon, and the colour of the disc it sits in. On a release walk the
// icon was the whole "E C H O" wordmark shrunk into 24 dp, and the shade showed a light blue disc with
// letters too small to read: Android lightens a colour as dark as Night navy until it stands out from
// a dark shade, and the navy came out as a pale blue. The icon is now the favicon's mark, the E of the
// wordmark with its hairline (docs/launch/store-graphics/favicon.html), made by
// scripts/generate-notification-icon.mjs.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { tokens } from '@/design/tokens';

import appJson from '../../app.json';

const ICON = 'assets/app/notification-icon.png';
const SIZE = 96;
/** Android keeps a small icon's glyph inside the central 20 of its 24 dp: 80 of 96 pixels. */
const LIVE = { from: 8, to: 88 };

type Image = { width: number; height: number; rgba: Uint8Array };

/** An 8-bit RGBA, non-interlaced PNG, decoded with zlib alone. */
function readPng(path: string): Image {
  const file = readFileSync(path);
  expect(file.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at);
    const type = file.toString('latin1', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      // Bit depth 8, colour type 6 (RGBA), no interlace.
      expect([body[8], body[9], body[12]]).toEqual([8, 6, 0]);
    }
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const rgba = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x] ?? 0;
      const left = x >= 4 ? (rgba[y * stride + x - 4] ?? 0) : 0;
      const up = y > 0 ? (rgba[(y - 1) * stride + x] ?? 0) : 0;
      const corner = x >= 4 && y > 0 ? (rgba[(y - 1) * stride + x - 4] ?? 0) : 0;
      const guess = left + up - corner;
      const nearest =
        Math.abs(guess - left) <= Math.abs(guess - up) &&
        Math.abs(guess - left) <= Math.abs(guess - corner)
          ? left
          : Math.abs(guess - up) <= Math.abs(guess - corner)
            ? up
            : corner;
      const predicted = [0, left, up, (left + up) >> 1, nearest][filter] ?? 0;
      rgba[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  return { width, height, rgba };
}

const icon = readPng(ICON);
const alpha = (x: number, y: number) => icon.rgba[(y * icon.width + x) * 4 + 3] ?? 0;
/** Pixels of a row with any ink in them, as [first, last], or null for an empty row. */
function inked(y: number): [number, number] | null {
  let first = -1;
  let last = -1;
  for (let x = 0; x < icon.width; x += 1) {
    if (alpha(x, y) === 0) continue;
    if (first < 0) first = x;
    last = x;
  }
  return first < 0 ? null : [first, last];
}
const rows = Array.from({ length: icon.height }, (_, y) => inked(y));
const top = rows.findIndex(Boolean);
const bottom = rows.length - 1 - [...rows].reverse().findIndex(Boolean);
const spans = rows.filter((row): row is [number, number] => row !== null);
const left = Math.min(...spans.map(([first]) => first));
const right = Math.max(...spans.map(([, last]) => last));

describe('the notification’s small icon', () => {
  it('is 96 × 96, the size Android’s densest screens draw a 24 dp icon at', () => {
    expect([icon.width, icon.height]).toEqual([SIZE, SIZE]);
  });

  it('is pure white on transparent, because Android draws it from its alpha alone', () => {
    for (let at = 0; at < icon.rgba.length; at += 4) {
      if ((icon.rgba[at + 3] ?? 0) === 0) continue;
      expect([icon.rgba[at], icon.rgba[at + 1], icon.rgba[at + 2]]).toEqual([255, 255, 255]);
    }
  });

  it('keeps its mark inside the central 20 of 24 dp, and fills it', () => {
    expect(top).toBeGreaterThanOrEqual(LIVE.from);
    expect(left).toBeGreaterThanOrEqual(LIVE.from);
    expect(bottom).toBeLessThan(LIVE.to);
    expect(right).toBeLessThan(LIVE.to);
    expect(bottom - top + 1).toBeGreaterThanOrEqual(0.9 * (LIVE.to - LIVE.from));
  });

  it('is one letter, the E, taller than it is wide: never the wordmark shrunk', () => {
    expect(right - left + 1).toBeLessThan(bottom - top + 1);
  });

  it('keeps the favicon’s hairline under the E: clear of it, as wide, and thick enough to show', () => {
    // From the bottom up: the hairline, then clear rows with no stray ink, then the E.
    let line = bottom;
    while (line >= top && rows[line]) line -= 1;
    const thickness = bottom - line;
    let gap = line;
    while (gap >= top && !rows[gap]) gap -= 1;
    expect(thickness).toBeGreaterThanOrEqual(4); // a dp at 4x, so it survives 24 dp
    expect(line - gap).toBeGreaterThanOrEqual(4);
    // The E is the taller part, and the hairline about as wide as it, as the favicon draws them.
    expect(gap - top).toBeGreaterThan(5 * thickness);
    const letter = rows.slice(top, gap + 1).filter((row): row is [number, number] => row !== null);
    const letterWidth =
      Math.max(...letter.map(([, last]) => last)) - Math.min(...letter.map(([first]) => first));
    const [from, to] = rows[bottom] ?? [0, 0];
    expect(to - from).toBeGreaterThanOrEqual(0.8 * letterWidth);
    expect(to - from).toBeLessThanOrEqual(1.25 * letterWidth);
  });
});

describe('the colour of the disc it sits in', () => {
  const plugin = appJson.expo.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-notifications',
  ) as [string, { icon: string; color: string }] | undefined;

  it('is the icon above', () => {
    expect(plugin?.[1].icon).toBe(`./${ICON}`);
  });

  // Android keeps a colour that already stands out from a dark shade, and only deepens it in a light
  // one. Night's gold is kept as it is in the dark, and deepens to a bronze of the same hue in the
  // light, so the disc reads as ECHO's in both. Night navy turned pale blue in the dark.
  it('is ECHO’s Night gold, from the design tokens', () => {
    expect(plugin?.[1].color).toBe(tokens.color.night.accentWarm);
  });
});
