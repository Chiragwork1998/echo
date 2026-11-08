// How the book stands while it opens. Everything the opening draws beyond the page and the cover is
// a pure function of two numbers that already exist: `a`, how far the book has risen or come forward
// (0 to 1), and `c`, how far the cover has swung (0 to 1). Nothing here has a clock of its own, so
// the ritual's lengths (./ritual) are the only lengths there are, and a tap or a practised book
// scales every layer with them. These run on the UI thread, hence the worklets.
import { clamp01, smoothstep } from '@/design/ease';

/** How far the cover swings from the spine, in degrees. Past 90 it lies open, showing its inside. */
export const SWING = -170;
/** The depth of the eye above the book, for the cover's swing and for everything that follows it. */
export const PERSPECTIVE = 1600;
/** At most this many leaves riffle past as a book with echoes in it opens. 0 removes them. */
export const RIFFLE_MAX = 3;
/** How bright the light that crosses the cloth is at its brightest. Judged on all eight cloths. */
export const CLOTH_LIGHT = 0.16;
/** How deep the cover's shadow is on the page at its deepest, before the gradient takes it to nothing. */
const SHADOW = 0.5;
/** The ribbon trails the rise by up to this many degrees. */
const SWAY_DEGREES = 2.5;

/** The cover is edge-on when the swing passes ninety degrees, a little after half way. */
const SWAP_FROM = 0.5;
const SWAP_TO = 0.56;

/** A book thickens with use: how many leaves riffle for this many echoes. A count, nothing more. */
export function riffleLeaves(echoes: number): number {
  if (!Number.isFinite(echoes) || echoes <= 0) return 0;
  return Math.min(RIFFLE_MAX, Math.round(Math.log2(1 + echoes)));
}

/** The ribbon trails the rise and hangs straight again at rest: degrees, 0 at both ends. */
export function ribbonSway(a: number): number {
  'worklet';
  return SWAY_DEGREES * 4 * a * (1 - a);
}

/** 1 while the ribbon's tail is tucked in the shut book, 0 once the cover has let it down. */
export function ribbonTuck(c: number): number {
  'worklet';
  return 1 - smoothstep(0.1, 0.5, c);
}

/**
 * How visible the arriving book is at progress t. It is there by `by` of its arrival (30 percent of
 * a rise), unless it appears where it rests (a tap came before it began to move), when it fades in
 * over the whole of its arrival instead of appearing in two frames.
 */
export function riseOpacity(t: number, inPlace: boolean | number, by = 0.3): number {
  'worklet';
  return inPlace ? clamp01(t) : clamp01(t / by);
}

/** The cover's angle about the spine, in degrees. */
export function coverAngle(c: number): number {
  'worklet';
  return c * SWING;
}

/** The cloth face turns from the light as it lifts: a black shade, 0 at rest and half by edge-on. */
export function frontShade(c: number): number {
  'worklet';
  return 0.5 * clamp01(c / 0.5);
}

/** The cloth is the face until the lining has covered it, while the board is edge-on. */
export function frontOpacity(c: number): number {
  'worklet';
  return c < SWAP_TO ? 1 : 0;
}

/** The inside fades up over the cloth across the edge-on moment, so no frame shows neither. */
export function liningOpacity(c: number): number {
  'worklet';
  return c >= SWAP_TO ? 1 : smoothstep(SWAP_FROM, SWAP_TO, c);
}

/** The inside starts in shadow and turns toward the light as it lies open. */
export function liningShade(c: number): number {
  'worklet';
  return 0.5 - 0.42 * clamp01((c - 0.5) / 0.5);
}

/** The board leaves as it comes to rest, so that nothing is left at the edge of the screen when it goes. */
export function hingeOpacity(c: number): number {
  'worklet';
  return 1 - smoothstep(0.8, 1, c);
}

/** The cover's shadow on the page: it comes as the board lifts, is deepest as it stands up, and is gone once it is edge-on. */
export function shadowOpacity(c: number): number {
  'worklet';
  return SHADOW * smoothstep(0.08, 0.36, c) * (1 - smoothstep(0.36, 0.56, c));
}

/**
 * Where the cover's free edge is on the page, in points from the spine, with the depth of the eye
 * taken into account: the board's far edge comes toward the viewer as it stands, and looks further
 * across than it is. 0 once the board is edge-on or lies open. The shadow it casts begins here, on
 * the page that the cover has left, and not under the cover where nothing could see it.
 */
export function coverEdge(c: number, width: number): number {
  'worklet';
  const radians = (coverAngle(c) * Math.PI) / 180;
  const toward = width * Math.sin(-radians);
  return Math.max(0, (width * Math.cos(radians) * PERSPECTIVE) / (PERSPECTIVE - toward));
}

/** A light across the top of the page as it is uncovered. It is 0 at rest. */
export function pageSheen(c: number): number {
  'worklet';
  return smoothstep(0.35, 0.7, c) * (1 - smoothstep(0.7, 1, c));
}

/** Where leaf `index` is in its turn, 0 to 1. Each starts a little after the one before. */
export function leafProgress(c: number, index: number): number {
  'worklet';
  const from = 0.46 + 0.07 * index;
  const to = Math.min(1, 0.86 + 0.07 * index);
  return clamp01((c - from) / (to - from));
}

/**
 * A leaf grows fainter as it turns. It is not there while it lies flat: it shows as it lifts, so the
 * page is the page the whole time the cover is coming off it and is not veiled before a leaf moves.
 */
export function leafOpacity(progress: number): number {
  'worklet';
  return (0.5 - 0.3 * progress) * smoothstep(0, 0.12, progress);
}

/** A leaf is shaded only in passing, as it stands up from the page. */
export function leafShade(progress: number): number {
  'worklet';
  return 0.16 * 4 * progress * (1 - progress);
}

/** The light that crosses the cloth as the book comes to rest. It is only in the second half of the rise. */
export function clothLightAlpha(a: number): number {
  'worklet';
  return CLOTH_LIGHT * smoothstep(0.45, 0.7, a) * (1 - smoothstep(0.7, 1, a));
}

/** Where the light's band is, as a share of the cover's width from its centre: -0.7 to +0.7. */
export function clothLightAt(a: number): number {
  'worklet';
  return -0.7 + 1.4 * clamp01((a - 0.45) / 0.55);
}

/** How far the book sinks as it goes, in points, and how much it shrinks as it does. */
export const SINK = { drop: 26, scale: 0.015 } as const;

/** The leaf that has been turned goes as it lands: its last stretch fades, so no sliver is left. */
export function closingLeafOpacity(shut: number): number {
  'worklet';
  return 1 - smoothstep(0.78, 1, shut);
}

/** The pitch of the hairline leaves of the left stack, in points. */
export const LEAF_PITCH = 1.5;

/**
 * The block of earlier leaves at the spine: how wide it is, in points, for this many echoes in the
 * book and this much room to the left of the page, and how many hairline leaves it is drawn with.
 * It thickens quickly at first and then more slowly, and never reaches the edge of the screen. A
 * count and nothing more: deleting an echo makes it honestly thinner.
 */
export function leafGeometry(echoes: number, gutter: number) {
  const n = Number.isFinite(echoes) && echoes > 0 ? echoes : 0;
  const left = Math.max(0, Math.min(gutter - 6, 3 + 12 * (1 - Math.exp(-n / 36))));
  return { left, leaves: Math.max(0, Math.floor(left / LEAF_PITCH)) };
}
