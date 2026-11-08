import type { Cue } from '@/design/haptics';
import type { ThemeName } from '@/design/tokens';
import type { Mood } from '@/state/onboarding';

export type Point = { x: number; y: number };
/** A stone on the stream: where its label sits and the half-width and half-height of its outline. */
export type StoneSpec = { value: Mood; at: Point; rx: number; ry: number };

// Measured from the production plates (assets/backgrounds/<theme>/06-arrival.webp), in the 393 x 852
// reference viewport that usePlatePoint maps onto the real screen. The plates were regenerated, so
// the stones sit differently from the goldens and differently from each other: Night's Light stone
// runs off the left edge, so its point is the visible part. Order matches copy.arrival.moods.
export const STONES: Record<ThemeName, readonly StoneSpec[]> = {
  night: [
    { value: 'light', at: { x: 50, y: 468 }, rx: 46, ry: 21 },
    { value: 'steady', at: { x: 292.5, y: 446 }, rx: 68, ry: 21 },
    { value: 'unsettled', at: { x: 189, y: 520 }, rx: 73, ry: 26 },
    { value: 'heavy', at: { x: 90.5, y: 629 }, rx: 74, ry: 43 },
    { value: 'numb', at: { x: 294, y: 655 }, rx: 74, ry: 44 },
  ],
  day: [
    { value: 'light', at: { x: 91.5, y: 452 }, rx: 59, ry: 23 },
    { value: 'steady', at: { x: 296, y: 450 }, rx: 66, ry: 29 },
    { value: 'unsettled', at: { x: 191.5, y: 508 }, rx: 56, ry: 20 },
    { value: 'heavy', at: { x: 89.5, y: 636.5 }, rx: 75, ry: 49 },
    { value: 'numb', at: { x: 306.5, y: 646 }, rx: 77, ry: 50 },
  ],
};

/** How far a standing ring spreads before it is gone, in points, for every stone. */
export const REACH = 44;

/** The ring that leaves a stone's rim the moment it is chosen. */
export type Impact = {
  /** How far it spreads past the rim, in points. */
  reach: number;
  /** How long it takes to spread and be gone. */
  ms: number;
  /** Its strongest opacity, as a share of the standing rings' strongest. */
  peak: number;
  /** Its line weight as it leaves the rim and as it is gone. */
  stroke: readonly [from: number, to: number];
};

/**
 * How the water answers a stone, by mood. Numbers only, so the lead can tune them on a phone: a
 * lighter word is quicker and shallower, a heavier one reaches further and takes longer, and Numb
 * is faint but present, so it reads as an answer and never as a fault. The standing rings keep
 * three paces (4200, 5600 and 7600 ms a cycle) and the glints twinkle in step; Steady and
 * Unsettled are today's. Only when and how fast things move changes with the mood: any still frame
 * is the golden's for all of them. `haptic` is the one cue the choice makes.
 */
export const WATER: Record<Mood, { impact: Impact; cycle: number; twinkle: number; haptic: Cue }> =
  {
    light: {
      impact: { reach: 40, ms: 700, peak: 1, stroke: [2.2, 0.8] },
      cycle: 4200,
      twinkle: 2000,
      haptic: 'fine',
    },
    steady: {
      impact: { reach: 44, ms: 900, peak: 1, stroke: [2.2, 0.8] },
      cycle: 5600,
      twinkle: 2600,
      haptic: 'tick',
    },
    unsettled: {
      impact: { reach: 46, ms: 900, peak: 1, stroke: [2.2, 0.8] },
      cycle: 5600,
      twinkle: 2600,
      haptic: 'tick',
    },
    heavy: {
      impact: { reach: 58, ms: 1300, peak: 1, stroke: [2.6, 1] },
      cycle: 7600,
      twinkle: 3600,
      haptic: 'settle',
    },
    numb: {
      impact: { reach: 34, ms: 1500, peak: 0.5, stroke: [1.2, 0.6] },
      cycle: 7600,
      twinkle: 3600,
      haptic: 'fine',
    },
  };

export type Water = (typeof WATER)[Mood];

/** The river is seen at a low angle, so rings are flatter than they are wide. */
export const FLATTEN = 0.45;
/** A hit target never gets smaller than this, however small the stone is drawn (COMPONENTS.md). */
export const MIN_HIT = 56;

type Box = { left: number; top: number; width: number; height: number };

/** The touch box for a stone on screen, centred on its label: the outline, grown to at least 56 pt. */
export function hitBox(centre: Point, rx: number, ry: number): Box {
  const width = Math.max(rx * 2, MIN_HIT);
  const height = Math.max(ry * 2, MIN_HIT);
  return { left: centre.x - width / 2, top: centre.y - height / 2, width, height };
}
