import { clamp01, smoothstep } from '@/design/ease';

/**
 * The dark that comes down with the breath, drawn as three bands of black rather than one sheet, so
 * the screen goes to sleep from the ground up: the foreground first, then the river and the valley,
 * then the sky. One value drives all three (`dark`, 0 clear to 1 black), each band taking its own
 * slice of it, and a wake releases them in the reverse order with no timers: the sky lifts first.
 *
 * This file is the geometry and the arithmetic only, so it can be tested without drawing anything.
 */
export type BandName = 'ground' | 'valley' | 'sky';

export type Band = {
  /** The solid part of the band, as a fraction of the screen's height. */
  from: number;
  to: number;
  /** How far beyond the solid part the black feathers away to nothing, in points. No edge shows. */
  featherAbove: number;
  featherBelow: number;
  /** How black it gets: the three together are never lighter than a single veil of 0.9. */
  max: number;
  /** The slice of `dark` over which it goes from clear to its full black. */
  rise: readonly [number, number];
};

/**
 * Each solid part overlaps its neighbour's (the sky to 0.34 and the valley from 0.28, the valley to
 * 0.58 and the ground from 0.52), so wherever one band is feathering away another is at full: no
 * row of the screen is ever lighter than the lightest band's maximum, 0.9, when the screen is dark.
 */
export const BANDS: Record<BandName, Band> = {
  ground: { from: 0.52, to: 1, featherAbove: 120, featherBelow: 0, max: 0.94, rise: [0, 0.5] },
  valley: { from: 0.28, to: 0.58, featherAbove: 80, featherBelow: 80, max: 0.92, rise: [0.2, 0.7] },
  sky: { from: 0, to: 0.34, featherAbove: 0, featherBelow: 80, max: 0.9, rise: [0.4, 0.9] },
};

/** A practice that recedes rests at this dark; only Sleep, going on to black, passes it. */
export const RESTING_DARK = 0.9;
/** The tide line stays, dimmed, until the last fifth of Sleep's fade to black, and then it goes. */
const TIDE_GOES = 0.8;
/** The steps of an eased feather: enough that no band shows a corner or a band of its own. */
const FEATHER_STEPS = 8;

/** How far into Sleep's fade the screen is, 0 at the resting dark and 1 at black. */
function fadeProgress(dark: number): number {
  'worklet';
  return clamp01((dark - 0.9) / 0.1);
}

/**
 * One band's opacity for this dark. Opacity is all that changes. With `full` (Sleep, once its fade
 * has begun) it carries on from its maximum to true black as `dark` runs the last tenth.
 */
export function bandOpacity(band: Band, dark: number, full: boolean): number {
  'worklet';
  const base = band.max * smoothstep(band.rise[0], band.rise[1], dark);
  if (!full) return base;
  return base + (1 - base) * fadeProgress(dark);
}

/**
 * How much of the tide line's light is left. A practice dims it by about half at the dark rest. Sleep
 * (`full`) lets the last of it go in the last fifth of its fade, so no line is left on a sleeper's eyes.
 */
export function tideLight(dark: number, full: boolean): number {
  'worklet';
  const dimmed = 1 - dark * 0.55;
  if (!full) return dimmed;
  return dimmed * (1 - smoothstep(TIDE_GOES, 1, fadeProgress(dark)));
}

/** Where one band sits on a screen this tall, and the gradient that feathers it. */
export function bandShape(band: Band, height: number) {
  const top = Math.max(0, band.from * height - band.featherAbove);
  const bottom = Math.min(height, band.to * height + band.featherBelow);
  const total = bottom - top;
  const above = band.from * height - top;
  const below = bottom - band.to * height;
  const locations: number[] = [];
  const alphas: number[] = [];
  if (above > 0) {
    for (let i = 0; i <= FEATHER_STEPS; i += 1) {
      locations.push((above * (i / FEATHER_STEPS)) / total);
      alphas.push(smoothstep(0, 1, i / FEATHER_STEPS));
    }
  } else {
    locations.push(0);
    alphas.push(1);
  }
  if (below > 0) {
    const start = (total - below) / total;
    for (let i = 0; i <= FEATHER_STEPS; i += 1) {
      locations.push(start + (below * (i / FEATHER_STEPS)) / total);
      alphas.push(1 - smoothstep(0, 1, i / FEATHER_STEPS));
    }
  } else {
    locations.push(1);
    alphas.push(1);
  }
  return { top, height: total, locations, alphas };
}

/** How black one row of a band is, 0 to 1, at its own full opacity: 1 in the solid part. */
function rowAlpha(band: Band, y: number, height: number): number {
  const solidTop = band.from * height;
  const solidBottom = band.to * height;
  if (y >= solidTop && y <= solidBottom) return 1;
  if (y < solidTop) {
    return band.featherAbove > 0
      ? smoothstep(0, 1, (y - (solidTop - band.featherAbove)) / band.featherAbove)
      : 0;
  }
  return band.featherBelow > 0 ? 1 - smoothstep(0, 1, (y - solidBottom) / band.featherBelow) : 0;
}

/**
 * How much black stands over one row of a screen `height` tall: the three bands laid over one
 * another, as the compositor does it. For tests, which look for a row that is lighter than it should be.
 */
export function coverage(dark: number, y: number, height: number, full: boolean): number {
  let clear = 1;
  for (const name of Object.keys(BANDS) as BandName[]) {
    const band = BANDS[name];
    clear *= 1 - rowAlpha(band, y, height) * bandOpacity(band, dark, full);
  }
  return 1 - clear;
}
