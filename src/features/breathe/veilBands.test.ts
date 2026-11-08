import { BANDS, bandOpacity, bandShape, coverage, tideLight, type BandName } from './veilBands';

const NAMES = Object.keys(BANDS) as BandName[];
const HEIGHTS = [640, 780, 852, 932, 1100];
const rows = (height: number) => Array.from({ length: height + 1 }, (_, y) => y);

describe('the three bands of the veil', () => {
  it('never lets the screen be lighter than a single veil of 0.9 at rest, on any row of any screen', () => {
    for (const height of HEIGHTS) {
      for (const y of rows(height)) {
        // Including every row where one band is feathering away and another is feathering in.
        expect(coverage(1, y, height, false)).toBeGreaterThanOrEqual(0.9 - 1e-9);
      }
    }
  });

  it('puts the screen to sleep from the ground up: ground first, then the valley, then the sky', () => {
    const at = (name: BandName, dark: number) => bandOpacity(BANDS[name], dark, false);
    expect(at('ground', 0.45)).toBeGreaterThan(at('valley', 0.45));
    expect(at('valley', 0.45)).toBeGreaterThan(at('sky', 0.45));
    // And clear of each other at the start: only the ground has begun by a quarter of the way.
    expect(at('ground', 0.25)).toBeGreaterThan(0.4);
    expect(at('valley', 0.25)).toBeLessThan(0.05);
    expect(at('sky', 0.25)).toBe(0);
  });

  it('lets go in the reverse order as the screen wakes, with no timers: the sky lifts first', () => {
    // dark falls from 0.9 to 0 on a wake: by 0.6 the sky is already clearing, the ground is still full.
    const at = (name: BandName, dark: number) => bandOpacity(BANDS[name], dark, false);
    expect(at('sky', 0.6)).toBeLessThan(at('valley', 0.6));
    expect(at('valley', 0.6)).toBeLessThan(at('ground', 0.6));
    expect(at('ground', 0.6)).toBeCloseTo(BANDS.ground.max, 5);
  });

  it('is clear at dark 0 and at its own maximum (0.94, 0.92, 0.9) at an almost-black rest', () => {
    for (const name of NAMES) {
      expect(bandOpacity(BANDS[name], 0, false)).toBe(0);
      expect(bandOpacity(BANDS[name], 0.9, false)).toBeCloseTo(BANDS[name].max, 6);
    }
    expect(NAMES.map((name) => BANDS[name].max)).toEqual([0.94, 0.92, 0.9]);
  });

  it('keeps every band feathered: no edge, and it fits the screen it is drawn on', () => {
    for (const height of HEIGHTS) {
      for (const name of NAMES) {
        const shape = bandShape(BANDS[name], height);
        expect(shape.top).toBeGreaterThanOrEqual(0);
        expect(shape.top + shape.height).toBeLessThanOrEqual(height);
        expect(shape.locations).toHaveLength(shape.alphas.length);
        // Fully clear at a feathered edge, and fully black in the solid part.
        if (BANDS[name].featherAbove > 0) expect(shape.alphas[0]).toBe(0);
        if (BANDS[name].featherBelow > 0) expect(shape.alphas.at(-1)).toBe(0);
        expect(Math.max(...shape.alphas)).toBe(1);
        // Stops run in order, so the gradient never doubles back on itself.
        shape.locations.forEach((at, i) => {
          if (i > 0) expect(at).toBeGreaterThanOrEqual(shape.locations[i - 1] ?? 0);
        });
        // Eased, not a straight ramp: a smooth start and a smooth end, so no band shows an edge.
        const feather = shape.alphas.slice(0, shape.alphas.indexOf(1) + 1);
        if (feather.length > 2) expect(feather[1]).toBeLessThan(1 / (feather.length - 1));
      }
    }
  });
});

describe('Sleep’s end', () => {
  it('goes to true black: every row at 1.0, and the tide line gone', () => {
    for (const height of HEIGHTS) {
      for (const y of rows(height)) expect(coverage(1, y, height, true)).toBeCloseTo(1, 9);
    }
    expect(tideLight(1, true)).toBe(0);
  });

  it('does not step when Sleep’s fade begins: it rides dark from 0.9, where the screen already is', () => {
    for (const name of NAMES) {
      expect(bandOpacity(BANDS[name], 0.9, true)).toBeCloseTo(BANDS[name].max, 9);
    }
    expect(tideLight(0.9, true)).toBeCloseTo(tideLight(0.9, false), 9);
  });

  it('keeps the tide line until the last fifth of the fade, then lets it go', () => {
    // dark 0.9 to 1 is the whole fade. Up to 0.98 (eight tenths of the way) the line has only dimmed
    // as any practice's does.
    expect(tideLight(0.95, true)).toBeCloseTo(tideLight(0.95, false), 9);
    expect(tideLight(0.98, true)).toBeCloseTo(tideLight(0.98, false), 9);
    expect(tideLight(0.99, true)).toBeLessThan(tideLight(0.99, false));
    expect(tideLight(0.999, true)).toBeLessThan(0.01);
    // Monotonic to nothing.
    let last = Infinity;
    for (let dark = 0.9; dark <= 1.0001; dark += 0.005) {
      const now = tideLight(Math.min(dark, 1), true);
      expect(now).toBeLessThanOrEqual(last + 1e-9);
      last = now;
    }
  });

  it('keeps a normal practice’s tide rule: it dims to about half and never goes out', () => {
    expect(tideLight(0, false)).toBe(1);
    expect(tideLight(0.9, false)).toBeCloseTo(1 - 0.9 * 0.55, 9);
    expect(tideLight(1, false)).toBeCloseTo(0.45, 9);
  });

  it('is exactly the screen as it is at dark 0', () => {
    for (const y of [0, 200, 500, 852]) expect(coverage(0, y, 852, false)).toBe(0);
  });
});
