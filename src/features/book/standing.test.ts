import {
  LEAF_PITCH,
  RIFFLE_MAX,
  clothLightAlpha,
  closingLeafOpacity,
  clothLightAt,
  coverAngle,
  coverHurry,
  coverEdge,
  frontOpacity,
  frontShade,
  hingeOpacity,
  leafGeometry,
  leafOpacity,
  leafProgress,
  leafShade,
  liningOpacity,
  liningShade,
  pageSheen,
  ribbonSway,
  ribbonTuck,
  riffleLeaves,
  riffleOpacity,
  riseOpacity,
  shadowOpacity,
  PERSPECTIVE,
  SWING,
} from './standing';

describe('how thick the book feels', () => {
  it('lets a few leaves riffle as a book with echoes in it opens', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 40, 5000].map(riffleLeaves)).toEqual([
      0, 1, 2, 2, 2, 3, 3, 3, 3, 3,
    ]);
    expect(RIFFLE_MAX).toBe(3);
  });

  it('never invents leaves from a count that is not a count', () => {
    expect(riffleLeaves(-4)).toBe(0);
    expect(riffleLeaves(Number.NaN)).toBe(0);
    expect(riffleLeaves(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('the ribbon', () => {
  it('trails the rise and comes to rest hanging straight', () => {
    expect(ribbonSway(0)).toBe(0);
    expect(ribbonSway(1)).toBe(0);
    expect(ribbonSway(0.5)).toBeCloseTo(2.5);
    // It never overshoots: the book is already there.
    for (let a = 0; a <= 1; a += 0.05) {
      expect(ribbonSway(a)).toBeGreaterThanOrEqual(0);
      expect(ribbonSway(a)).toBeLessThanOrEqual(2.5 + 1e-9);
    }
  });

  it('keeps its tail tucked until the cover unseats, then lets it down', () => {
    expect(ribbonTuck(0)).toBe(1);
    expect(ribbonTuck(0.1)).toBe(1);
    expect(ribbonTuck(0.5)).toBe(0);
    expect(ribbonTuck(1)).toBe(0);
    let before = 1;
    for (let c = 0; c <= 1; c += 0.02) {
      expect(ribbonTuck(c)).toBeLessThanOrEqual(before + 1e-9);
      before = ribbonTuck(c);
    }
  });
});

describe('a book arriving where it rests', () => {
  it('fades in over the first of its rise, when it has far to come', () => {
    expect(riseOpacity(0, false)).toBe(0);
    expect(riseOpacity(0.15, false)).toBeCloseTo(0.5);
    expect(riseOpacity(0.3, false)).toBe(1);
    expect(riseOpacity(0.9, false)).toBe(1);
  });

  it('fades in over the whole of its arrival when it appears where it rests', () => {
    expect(riseOpacity(0.1, true)).toBeCloseTo(0.1);
    expect(riseOpacity(0.3, true)).toBeCloseTo(0.3);
    expect(riseOpacity(1, true)).toBe(1);
    // The audit's numbers: a number stands for a flag.
    expect(riseOpacity(0.1, 1)).toBeCloseTo(0.1);
    expect(riseOpacity(0.1, 0)).toBeCloseTo(1 / 3);
    expect(riseOpacity(-1, true)).toBe(0);
  });

  it('is there sooner or later as the arrival is quicker or slower to show', () => {
    expect(riseOpacity(0.275, false, 0.55)).toBeCloseTo(0.5);
    expect(riseOpacity(0.55, false, 0.55)).toBe(1);
    expect(riseOpacity(0.275, true, 0.55)).toBeCloseTo(0.275);
  });
});

describe('the cover as a board with an inside', () => {
  it('swings no further than a board can lie', () => {
    expect(coverAngle(0)).toBeCloseTo(0);
    expect(coverAngle(1)).toBe(SWING);
    expect(SWING).toBeLessThan(-90);
    expect(SWING).toBeGreaterThanOrEqual(-180);
  });

  it('turns from the light as it lifts', () => {
    expect(frontShade(0)).toBe(0);
    expect(frontShade(0.25)).toBeCloseTo(0.25);
    expect(frontShade(0.5)).toBeCloseTo(0.5);
  });

  it('shows its inside from the moment it is edge-on, with no instant in which neither face is there', () => {
    // Edge-on is where 170 degrees times c passes ninety.
    const edge = 90 / -SWING;
    expect(edge).toBeGreaterThan(0.5);
    expect(edge).toBeLessThan(0.56);
    expect(frontOpacity(0)).toBe(1);
    expect(liningOpacity(0)).toBe(0);
    expect(liningOpacity(0.5)).toBe(0);
    expect(liningOpacity(0.56)).toBe(1);
    expect(liningOpacity(1)).toBe(1);
    for (let c = 0; c <= 1; c += 0.005) {
      // Something solid is always showing: the cloth, then the lining over it, then the lining alone.
      const covered = Math.max(frontOpacity(c), liningOpacity(c));
      expect(covered).toBe(1);
    }
  });

  it('lets the lining turn toward the light once it lies open', () => {
    expect(liningShade(0.5)).toBeCloseTo(0.5);
    expect(liningShade(1)).toBeCloseTo(0.08);
    expect(liningShade(0.75)).toBeLessThan(liningShade(0.5));
  });

  it('leaves the hinge as the board comes to rest, so nothing stays at the edge of the screen', () => {
    expect(hingeOpacity(0)).toBe(1);
    expect(hingeOpacity(0.5)).toBe(1);
    expect(hingeOpacity(1)).toBe(0);
  });
});

describe('what the cover does to the page under it', () => {
  it('casts a shadow that comes as the board lifts and is gone by the time it is edge-on', () => {
    expect(shadowOpacity(0)).toBe(0);
    expect(shadowOpacity(0.08)).toBe(0);
    expect(shadowOpacity(0.36)).toBeCloseTo(0.5);
    expect(shadowOpacity(0.56)).toBe(0);
    expect(shadowOpacity(1)).toBe(0);
    for (let c = 0; c <= 1; c += 0.01) {
      expect(shadowOpacity(c)).toBeGreaterThanOrEqual(0);
      expect(shadowOpacity(c)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    // It is the deepest while the board stands up, and the board is not yet edge-on.
    expect(shadowOpacity(0.36)).toBeGreaterThan(shadowOpacity(0.2));
    expect(shadowOpacity(0.36)).toBeGreaterThan(shadowOpacity(0.5));
  });

  it('begins at the cover\u2019s free edge, which crosses the page as the board swings and is at the spine once it is edge-on', () => {
    const W = 355;
    expect(coverEdge(0, W)).toBeCloseTo(W);
    // It bulges a hair past the page as the board first lifts toward the eye, then crosses it for good.
    let before = Infinity;
    for (let c = 0.1; c <= 0.53; c += 0.01) {
      expect(coverEdge(c, W)).toBeLessThanOrEqual(before + 1e-9);
      before = coverEdge(c, W);
    }
    // The eye is above the book: the far edge looks further across than the flat swing puts it.
    const flat = W * Math.cos((60 * Math.PI) / 180);
    expect(coverEdge(60 / -SWING, W)).toBeGreaterThan(flat);
    expect(PERSPECTIVE).toBeGreaterThan(W);
    // Past edge-on it lies open to the left of the spine, and its shadow has nothing to begin from.
    expect(coverEdge(0.8, W)).toBe(0);
    expect(coverEdge(1, W)).toBe(0);
  });

  it('brightens the top of the page as it is uncovered and is gone when the book is open', () => {
    expect(pageSheen(0)).toBe(0);
    expect(pageSheen(0.35)).toBe(0);
    expect(pageSheen(0.7)).toBe(1);
    expect(pageSheen(1)).toBe(0);
  });
});

describe('the leaves that riffle', () => {
  it('follow the cover, each a little after the one before, and all lie open when it does', () => {
    expect(leafProgress(0.4, 0)).toBe(0);
    expect(leafProgress(1, 0)).toBe(1);
    expect(leafProgress(1, 1)).toBe(1);
    expect(leafProgress(1, 2)).toBe(1);
    expect(leafProgress(0.66, 0)).toBeCloseTo(0.5);
    expect(leafProgress(0.66, 1)).toBeLessThan(leafProgress(0.66, 0));
    expect(leafProgress(0.66, 2)).toBeLessThan(leafProgress(0.66, 1));
  });

  it('grow fainter as they turn, are not there while they lie flat, and shade only in passing', () => {
    // Flat on the page a leaf would only veil it: it shows as it lifts.
    expect(leafOpacity(0)).toBe(0);
    expect(leafOpacity(0.12)).toBeCloseTo(0.5 - 0.3 * 0.12);
    expect(leafOpacity(0.5)).toBeCloseTo(0.35);
    expect(leafOpacity(1)).toBeCloseTo(0.2);
    expect(leafShade(0)).toBe(0);
    expect(leafShade(0.5)).toBeCloseTo(0.16);
    expect(leafShade(1)).toBe(0);
  });

  it('leave with the board as it comes to rest, so none is cut off when the book is open', () => {
    // A leaf lying open is still faintly there; the board fading takes it to nothing with it.
    expect(leafOpacity(leafProgress(1, 0))).toBeGreaterThan(0);
    for (const index of [0, 1, 2]) {
      expect(riffleOpacity(1, index)).toBe(0);
      expect(riffleOpacity(0.7, index)).toBeCloseTo(leafOpacity(leafProgress(0.7, index)), 5);
      expect(riffleOpacity(0.9, index)).toBeLessThan(leafOpacity(leafProgress(0.9, index)));
    }
  });
});

describe('a tap that says enough to the opening', () => {
  it('starts a cover still at rest from rest, and carries on a cover already moving', () => {
    expect(coverHurry(0)).toBe('inOut');
    expect(coverHurry(0.02)).toBe('inOut');
    expect(coverHurry(0.03)).toBe('out');
    expect(coverHurry(0.6)).toBe('out');
  });
});

describe('the light that crosses the cloth as the book comes to rest', () => {
  it('is not there at the start or at the end, and crosses from one side to the other', () => {
    expect(clothLightAlpha(0)).toBe(0);
    expect(clothLightAlpha(0.45)).toBe(0);
    expect(clothLightAlpha(0.7)).toBeCloseTo(0.16);
    expect(clothLightAlpha(1)).toBe(0);
    expect(clothLightAt(0.45)).toBeCloseTo(-0.7);
    expect(clothLightAt(1)).toBeCloseTo(0.7);
    expect(clothLightAt(0)).toBeCloseTo(-0.7);
  });
});

describe('the block of earlier leaves at the spine', () => {
  it('is 3 pt thick in a book with nothing in it, and thickens more slowly as it fills', () => {
    expect(leafGeometry(0, 20).left).toBeCloseTo(3, 5);
    expect(leafGeometry(7, 40).left).toBeCloseTo(5.12, 1);
    expect(leafGeometry(30, 40).left).toBeCloseTo(9.79, 1);
    expect(leafGeometry(100, 40).left).toBeCloseTo(14.25, 1);
    let before = leafGeometry(0, 99).left;
    for (const n of [1, 5, 20, 60, 120, 400]) {
      const now = leafGeometry(n, 99).left;
      expect(now).toBeGreaterThan(before);
      before = now;
    }
    const early = leafGeometry(1, 99).left - leafGeometry(0, 99).left;
    const late = leafGeometry(41, 99).left - leafGeometry(40, 99).left;
    expect(late).toBeLessThan(early);
  });

  it('never reaches the edge of the screen: it stops 6 pt short of the room it has', () => {
    expect(leafGeometry(1000, 20).left).toBe(14);
    expect(leafGeometry(100, 20).left).toBe(14);
    expect(leafGeometry(1000, 24).left).toBeCloseTo(15, 0);
    expect(leafGeometry(1000, 24).left).toBeLessThanOrEqual(18);
    expect(leafGeometry(1000, 28).left).toBeLessThanOrEqual(22);
  });

  it('is drawn with a hairline for every point and a half of it', () => {
    expect(leafGeometry(0, 20).leaves).toBe(2);
    expect(leafGeometry(100, 20).leaves).toBe(9);
    expect(leafGeometry(100, 20).leaves * LEAF_PITCH).toBeLessThanOrEqual(14);
  });

  it('is a count and nothing else: deleting an echo makes it thinner', () => {
    expect(leafGeometry(29, 40).left).toBeLessThan(leafGeometry(30, 40).left);
    expect(leafGeometry(-3, 20).left).toBeCloseTo(3, 5);
    expect(leafGeometry(Number.NaN, 20).left).toBeCloseTo(3, 5);
  });

  it('is nothing where there is no room', () => {
    expect(leafGeometry(50, 2).left).toBe(0);
    expect(leafGeometry(50, 2).leaves).toBe(0);
  });
});

describe('the last leaf', () => {
  it('is there until its last stretch, and then it goes, so no sliver is left at the edge', () => {
    expect(closingLeafOpacity(0)).toBe(1);
    expect(closingLeafOpacity(0.78)).toBe(1);
    expect(closingLeafOpacity(0.9)).toBeGreaterThan(0);
    expect(closingLeafOpacity(0.9)).toBeLessThan(1);
    expect(closingLeafOpacity(1)).toBe(0);
  });
});
