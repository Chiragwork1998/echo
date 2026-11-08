import { tokens } from '@/design/tokens';

/**
 * A stone is set. The beats of the arrival, in milliseconds from T, the moment it begins. The curve
 * for every move is ECHO's decelerating one (design/ease). Nothing here moves anything but opacity,
 * and, in the Night cairn, the stones' own height.
 */

/** Each stone begins this long after the one below it. */
export const STONE_STAGGER_MS = 110;
/** A stone drops into its place, and fades in, over this long. */
export const STONE_DROP_MS = 360;
/** How far above its place a stone starts, in the cairn's 40 unit box: about 6 pt at 23 pt. */
export const STONE_DROP = 10;
/** The dashed outline of the day lets go as the first stone begins. */
export const OUTLINE_OUT_MS = 240;
/** The darkening where one stone rests on another follows the stone that rests there. */
export const SHADE_LAG_MS = 200;
export const SHADE_MS = 240;
/** The weekday under the cairn goes from the quiet word to the plain one. */
export const LABEL_AT_MS = 330;
export const LABEL_MS = 320;
/** The count line changes once the top stone is down: the old words out, then the new ones in. */
export const COUNT_AT_MS = 450;
export const COUNT_OUT_MS = 200;
export const COUNT_IN_LAG_MS = 60;
export const COUNT_IN_MS = 240;

/** Day: the new pebble comes in, and the one before it cools from bright. */
export const PEBBLE_IN_MS = 360;
export const PEBBLE_COOL_MS = 600;
/** The new pebble starts a little small and a little above its place. */
export const PEBBLE_FROM_SCALE = 0.6;
export const PEBBLE_FROM_LIFT = 8;

/** Reduce Motion: no stagger, no drop. Everything is a plain fade of this length. */
export const REDUCED_MS = tokens.motion.fast;

/**
 * A decelerating stone is nearly down well before its time is up: the curve has covered nine tenths
 * of the way in the first 130 ms. That is when it lands, and when the hand feels it.
 */
export const LAND_MS = 130;

/** The top stone has landed this long after T. The one haptic of the arrival is made here. */
export const SETTLE_AT_MS = 3 * STONE_STAGGER_MS + LAND_MS;
export const PEBBLE_SETTLE_AT_MS = LAND_MS;

/** The last beat of the Night arrival has ended; the cairn goes back to the plain drawing. */
export const NIGHT_END_MS = Math.max(
  3 * STONE_STAGGER_MS + STONE_DROP_MS,
  LABEL_AT_MS + LABEL_MS,
  COUNT_AT_MS + COUNT_IN_LAG_MS + COUNT_IN_MS,
);
export const DAY_END_MS = Math.max(PEBBLE_IN_MS, PEBBLE_COOL_MS, COUNT_IN_LAG_MS + COUNT_IN_MS);
/** A frame or two past the last beat, so the swap back to the plain drawing is never early. */
export const END_MARGIN_MS = 40;

/** Home waits this long, once it is whole again, so the person sees the open outline first. */
export const HOLD_MS = 200;
/** The welcome: the cairn begins this long after Home's first focus, while the river wakes. */
export const WELCOME_ARRIVAL_AT_MS = 900;
