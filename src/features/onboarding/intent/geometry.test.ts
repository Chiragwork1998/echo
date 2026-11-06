import { copy } from '@/content/copy';

import {
  DASH,
  IDLE_LABEL_SCALE,
  LABEL,
  MARKER,
  RIVER_POINTS,
  TRAIL_LEGS,
  dashArrayFor,
  fitTitleSize,
  pathLength,
  placeLabel,
  smoothPath,
} from './geometry';

// Natural width of each label per point of font size in Cormorant Garamond Regular, measured from the
// font file. Order matches copy.intent.options.
const EM_WIDTH = [6.006, 7.347, 7.895, 7.034];

/** The reference viewport scaling that usePlatePoint applies, repeated here as plain arithmetic. */
function toScreen(x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / 393, height / 852);
  return { x: (width - 393 * scale) / 2 + x * scale, y: (height - 852 * scale) / 2 + y * scale };
}

describe('river geometry', () => {
  it('has one point per choice, in the order of the copy deck', () => {
    expect(RIVER_POINTS.map((point) => point.value)).toEqual([
      'quiet',
      'understand_self',
      'hold_moments',
      'direction',
    ]);
    expect(RIVER_POINTS).toHaveLength(copy.intent.options.length);
  });

  it('keeps every point and trail knot inside the reference viewport', () => {
    const everything = [...RIVER_POINTS.map((p) => p.at), ...TRAIL_LEGS.flat()];
    for (const { x, y } of everything) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(393);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(852);
    }
  });

  it('runs one trail leg between each pair of points, stopping just outside the rings', () => {
    expect(TRAIL_LEGS).toHaveLength(RIVER_POINTS.length - 1);
    TRAIL_LEGS.forEach((leg, index) => {
      const from = RIVER_POINTS[index]!.at;
      const to = RIVER_POINTS[index + 1]!.at;
      const start = leg[0]!;
      const end = leg[leg.length - 1]!;
      const ring = MARKER.idleDiameter / 2;
      expect(Math.hypot(start.x - from.x, start.y - from.y)).toBeGreaterThan(ring);
      expect(Math.hypot(start.x - from.x, start.y - from.y)).toBeLessThan(ring + 8);
      expect(Math.hypot(end.x - to.x, end.y - to.y)).toBeGreaterThan(ring);
      expect(Math.hypot(end.x - to.x, end.y - to.y)).toBeLessThan(ring + 8);
    });
  });
});

describe('trail path', () => {
  it('draws a smooth curve that starts and ends on the first and last knot', () => {
    const d = smoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ]);
    expect(d.startsWith('M0 0 C')).toBe(true);
    expect(d.endsWith('20 0')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
  });

  it('returns nothing for fewer than two points', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 1, y: 1 }])).toBe('');
  });

  it('measures a straight line exactly', () => {
    const length = pathLength([
      { x: 0, y: 0 },
      { x: 30, y: 40 },
    ]);
    expect(length).toBeCloseTo(50, 1);
  });

  it('fits dashes so each leg begins and ends on a whole dash, near the golden rhythm', () => {
    for (const leg of TRAIL_LEGS) {
      const length = pathLength(leg);
      const [dash, gap] = dashArrayFor(length);
      const period = dash + gap;
      const count = (length - DASH.visible) / period + 1;
      expect(Math.abs(count - Math.round(count))).toBeLessThan(0.01);
      expect(period).toBeGreaterThan(DASH.visible + DASH.gap - 0.3);
      expect(period).toBeLessThan(DASH.visible + DASH.gap + 0.3);
    }
  });
});

describe('label placement', () => {
  const widthAt = (index: number) => EM_WIDTH[index]! * LABEL.selectedSize;

  it('keeps every label on the right of its marker on the reference phone, as in the golden', () => {
    RIVER_POINTS.forEach(({ at }, index) => {
      expect(placeLabel(at.x, widthAt(index), 393).side).toBe('right');
    });
  });

  it('moves "Find my direction" to the left on a compact phone rather than clip it', () => {
    const find = toScreen(RIVER_POINTS[3]!.at.x, 0, 360, 780);
    expect(placeLabel(find.x, widthAt(3), 360).side).toBe('left');
  });

  it('never lets a label cross the screen edge, selected or not, on common phone sizes', () => {
    const phones = [
      [360, 780],
      [375, 667],
      [393, 852],
      [412, 915],
      [430, 932],
    ] as const;
    for (const [width, height] of phones) {
      // Up to 120% text, the largest size before the list layout takes over.
      for (const textScale of [1, 1.1, 1.2]) {
        RIVER_POINTS.forEach(({ at }, index) => {
          const marker = toScreen(at.x, at.y, width, height);
          const natural = widthAt(index) * textScale;
          const { side, selectedScale } = placeLabel(marker.x, natural, width);
          const idleOffset = MARKER.idleDiameter / 2 + MARKER.labelGap;
          const selectedOffset = MARKER.selectedDiameter / 2 + MARKER.labelGap;
          if (side === 'right') {
            expect(marker.x + idleOffset + natural * IDLE_LABEL_SCALE).toBeLessThanOrEqual(
              width - LABEL.edgeMargin + 0.001,
            );
            expect(marker.x + selectedOffset + natural * selectedScale).toBeLessThanOrEqual(
              width - LABEL.edgeMargin + 0.001,
            );
          } else {
            expect(marker.x - selectedOffset - natural).toBeGreaterThanOrEqual(LABEL.edgeMargin);
          }
        });
      }
    }
  });

  it('shrinks a selected label toward its resting size when space is tight, never below it', () => {
    const tight = placeLabel(250, 110, 393);
    expect(tight.side).toBe('right');
    expect(tight.selectedScale).toBeGreaterThanOrEqual(IDLE_LABEL_SCALE);
    expect(tight.selectedScale).toBeLessThan(1);
    expect(placeLabel(100, 100, 393).selectedScale).toBe(1);
  });

  it('keeps room between neighbouring touch targets on every phone', () => {
    for (const [width, height] of [
      [360, 780],
      [430, 932],
    ] as const) {
      const centres = RIVER_POINTS.map(({ at }) => toScreen(at.x, at.y, width, height));
      centres.slice(1).forEach((centre, index) => {
        expect(centre.y - centres[index]!.y).toBeGreaterThan(MARKER.hit);
      });
    }
  });
});

describe('title size', () => {
  const BASE = 35.2;
  // The title is 9.408 em wide in Cormorant Garamond Regular.
  const widthOf = (size: number, fontScale = 1) => 9.408 * size * fontScale;

  it('keeps the full size on the reference phone', () => {
    expect(fitTitleSize(BASE, 393 - 48, 1)).toBe(BASE);
  });

  it('shrinks a little on a compact phone so the title stays on one line', () => {
    const size = fitTitleSize(BASE, 360 - 40, 1);
    expect(size).toBeLessThan(BASE);
    expect(size).toBeGreaterThan(BASE * 0.93);
    expect(widthOf(size)).toBeLessThanOrEqual(320);
  });

  it('allows for system text scaling', () => {
    const size = fitTitleSize(BASE, 345, 1.2);
    expect(widthOf(size, 1.2)).toBeLessThanOrEqual(345);
  });
});
