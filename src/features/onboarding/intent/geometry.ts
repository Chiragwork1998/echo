import type { Intent } from '@/state/onboarding';

export type Point = { x: number; y: number };

// Everything below was measured from the Night and Day goldens (the two agree to under 1 pt), in
// the 393 x 852 reference viewport. usePlatePoint maps it onto the real screen.

/** Where each choice sits on the river. Order matches copy.intent.options. */
export const RIVER_POINTS: readonly { value: Intent; at: Point }[] = [
  { value: 'quiet', at: { x: 64.9, y: 402.7 } },
  { value: 'understand_self', at: { x: 193.8, y: 480.8 } },
  { value: 'hold_moments', at: { x: 56.8, y: 571.6 } },
  { value: 'direction', at: { x: 266.6, y: 657.9 } },
];

/**
 * The dotted trail, one leg between each pair of points. Each leg is the centre line of the golden's
 * dashes, from just outside one ring to just outside the next. Legs stop short of the selected ring
 * so the glowing ring always sits on top of the trail.
 */
export const TRAIL_LEGS: readonly (readonly Point[])[] = [
  [
    { x: 64.7, y: 413.1 },
    { x: 66.9, y: 420.1 },
    { x: 70.8, y: 424.9 },
    { x: 79.3, y: 430.2 },
    { x: 92.3, y: 435.2 },
    { x: 108.2, y: 439.7 },
    { x: 127.5, y: 443.9 },
    { x: 146.5, y: 447.6 },
    { x: 165.1, y: 451.4 },
    { x: 181.6, y: 456.5 },
    { x: 189.5, y: 461.3 },
    { x: 192.6, y: 465.1 },
    { x: 194.0, y: 470.0 },
  ],
  [
    { x: 193.9, y: 495.2 },
    { x: 196.4, y: 500.9 },
    { x: 200.5, y: 504.3 },
    { x: 208.3, y: 509.0 },
    { x: 216.4, y: 515.1 },
    { x: 218.7, y: 520.0 },
    { x: 212.3, y: 529.2 },
    { x: 198.1, y: 535.1 },
    { x: 179.4, y: 539.7 },
    { x: 155.6, y: 544.3 },
    { x: 131.4, y: 548.3 },
    { x: 104.7, y: 553.0 },
    { x: 84.1, y: 558.1 },
    { x: 72.9, y: 562.1 },
    { x: 65.4, y: 566.4 },
  ],
  [
    { x: 56.9, y: 582.6 },
    { x: 59.8, y: 588.5 },
    { x: 67.7, y: 593.8 },
    { x: 82.2, y: 598.9 },
    { x: 104.8, y: 604.3 },
    { x: 129.5, y: 609.0 },
    { x: 158.5, y: 613.9 },
    { x: 189.1, y: 618.2 },
    { x: 219.4, y: 623.7 },
    { x: 244.8, y: 630.1 },
    { x: 260.3, y: 637.0 },
    { x: 264.2, y: 640.8 },
    { x: 266.8, y: 646.8 },
  ],
];

/** The golden's dashes: 3 pt long, about 2 pt apart, 1.5 pt thick. */
export const DASH = { visible: 3, gap: 2, thickness: 1.5 } as const;

const round = (n: number) => Math.round(n * 100) / 100;

type Segment = { from: Point; c1: Point; c2: Point; to: Point };

/** Catmull-Rom spline through the points, as cubic Bezier segments. It passes through every knot. */
function segments(points: readonly Point[]): Segment[] {
  const last = points.length - 1;
  const at = (i: number) => points[Math.max(0, Math.min(last, i))]!;
  return points.slice(0, -1).map((_, i) => {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    return {
      from: p1,
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      to: p2,
    };
  });
}

/** An SVG path through the points that bends smoothly between them. */
export function smoothPath(points: readonly Point[]): string {
  const [first] = points;
  if (!first || points.length < 2) return '';
  const curves = segments(points).map(
    ({ c1, c2, to }) =>
      `C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(to.x)} ${round(to.y)}`,
  );
  return [`M${round(first.x)} ${round(first.y)}`, ...curves].join(' ');
}

/** Length of the spline, summed over short straight pieces. Accurate to well under a point. */
export function pathLength(points: readonly Point[], steps = 12): number {
  let length = 0;
  for (const { from, c1, c2, to } of segments(points)) {
    let previous = from;
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const u = 1 - t;
      const x = u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x;
      const y = u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y;
      length += Math.hypot(x - previous.x, y - previous.y);
      previous = { x, y };
    }
  }
  return length;
}

/**
 * Dash spacing that lets a leg of the given length begin and end on a whole dash, staying within a
 * few percent of the golden's rhythm. Returns the stroke dash array for round caps, where the caps
 * add the stroke thickness to each dash.
 */
export function dashArrayFor(length: number): [number, number] {
  const period = DASH.visible + DASH.gap;
  const count = Math.max(2, Math.round((length - DASH.visible) / period) + 1);
  const fitted = (length - DASH.visible) / (count - 1);
  return [DASH.visible - DASH.thickness, fitted - (DASH.visible - DASH.thickness)];
}

/** Marker and label geometry, in screen points. These stay constant on every phone. */
export const MARKER = {
  idleDiameter: 17,
  selectedDiameter: 27,
  /** Space between the ring and the start of its label. */
  labelGap: 8.25,
  hit: 44,
} as const;

export const LABEL = {
  /** Selected labels are set larger. Labels are laid out at this size, then scaled down at rest. */
  selectedSize: 14.2,
  idleSize: 12.8,
  /** Least space kept between a label and the screen edge. */
  edgeMargin: 12,
} as const;

export const IDLE_LABEL_SCALE = LABEL.idleSize / LABEL.selectedSize;

export type LabelPlacement = {
  side: 'right' | 'left';
  /** Scale of the selected label. Shrinks toward the resting scale when space beside it runs out. */
  selectedScale: number;
};

/**
 * Chooses which side of its marker a label sits on, so it never leaves the screen. Labels sit on the
 * right as in the golden. A label that cannot fit there, such as "Find my direction" on a narrow
 * phone or at larger text sizes, moves to the left of its marker.
 *
 * @param markerX centre of the marker on screen
 * @param textWidth natural width of the label when laid out at LABEL.selectedSize
 */
export function placeLabel(
  markerX: number,
  textWidth: number,
  screenWidth: number,
): LabelPlacement {
  const limit = screenWidth - LABEL.edgeMargin;
  // A chosen label sits further from its marker, so it must fit there even at its smallest size.
  const selectedStart = markerX + MARKER.selectedDiameter / 2 + MARKER.labelGap;
  if (selectedStart + textWidth * IDLE_LABEL_SCALE > limit) {
    return { side: 'left', selectedScale: 1 };
  }
  const room = (limit - selectedStart) / textWidth;
  return { side: 'right', selectedScale: Math.min(1, Math.max(IDLE_LABEL_SCALE, room)) };
}

/** Natural width of the title per point of font size, in Cormorant Garamond Regular. */
const TITLE_WIDTH_EM = 9.408;

/**
 * The largest title size, up to `base`, that keeps "What brought you here?" on one line in the room
 * available. System text scaling multiplies the size, so it is divided out here.
 */
export function fitTitleSize(base: number, available: number, fontScale: number): number {
  const fit = (available * 0.99) / (TITLE_WIDTH_EM * Math.max(1, fontScale));
  return Math.min(base, Math.floor(fit * 10) / 10);
}
