import { copy } from '@/content/copy';

import { MIN_HIT, REACH, STONES, WATER, hitBox } from './geometry';

const REFERENCE = { width: 393, height: 852 };
const CTA_TOP = REFERENCE.height - 34 - 18 - 56 - 12;

describe.each(['night', 'day'] as const)('stones on the %s plate', (theme) => {
  const stones = STONES[theme];
  const boxes = stones.map(({ at, rx, ry }) => hitBox(at, rx, ry));

  it('has one stone for each word in the copy deck, in the deck order', () => {
    expect(stones.map((stone) => stone.value)).toEqual([
      'light',
      'steady',
      'unsettled',
      'heavy',
      'numb',
    ]);
    expect(copy.arrival.moods).toHaveLength(stones.length);
  });

  it('gives every stone a hit target of at least 56 pt', () => {
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(MIN_HIT);
      expect(box.height).toBeGreaterThanOrEqual(MIN_HIT);
    }
  });

  it('keeps the targets apart, below the heading, and above the CTA', () => {
    boxes.forEach((a, i) => {
      expect(a.top).toBeGreaterThan(200);
      expect(a.top + a.height).toBeLessThan(CTA_TOP);
      boxes.slice(i + 1).forEach((b) => {
        const apart =
          a.left + a.width <= b.left ||
          b.left + b.width <= a.left ||
          a.top + a.height <= b.top ||
          b.top + b.height <= a.top;
        expect(apart).toBe(true);
      });
    });
  });

  it('keeps every word on screen', () => {
    for (const { at } of stones) {
      expect(at.x).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(REFERENCE.width);
    }
  });
});

describe('how the water answers each stone', () => {
  const moods = ['light', 'steady', 'unsettled', 'heavy', 'numb'] as const;

  it("has a row for every mood, and the standing reach is the golden's 44 pt", () => {
    expect(Object.keys(WATER).sort()).toEqual([...moods].sort());
    expect(REACH).toBe(44);
  });

  it('reaches furthest for the heaviest stone and least for the faintest', () => {
    const reach = (mood: (typeof moods)[number]) => WATER[mood].impact.reach;
    expect(reach('numb')).toBeLessThan(reach('light'));
    expect(reach('light')).toBeLessThan(reach('steady'));
    expect(reach('steady')).toBeLessThanOrEqual(reach('unsettled'));
    expect(reach('unsettled')).toBeLessThan(reach('heavy'));
  });

  it('keeps to three paces for the standing rings, and makes the heavy ones slowest', () => {
    for (const mood of moods) expect([4200, 5600, 7600]).toContain(WATER[mood].cycle);
    expect(WATER.light.cycle).toBeLessThan(WATER.steady.cycle);
    expect(WATER.steady.cycle).toBe(WATER.unsettled.cycle);
    expect(WATER.heavy.cycle).toBeGreaterThan(WATER.unsettled.cycle);
  });

  it("keeps today's pace for Steady and Unsettled, so the golden frame is untouched", () => {
    expect(WATER.steady.cycle).toBe(5600);
    expect(WATER.steady.twinkle).toBe(2600);
    expect(WATER.unsettled.cycle).toBe(5600);
    expect(WATER.unsettled.twinkle).toBe(2600);
  });

  it("never lets the impact ring outlast the standing rings' first cycle", () => {
    for (const mood of moods) {
      const { impact, cycle } = WATER[mood];
      expect(impact.ms).toBeGreaterThan(0);
      expect(impact.ms).toBeLessThan(cycle / 3);
      expect(impact.peak).toBeGreaterThan(0);
      expect(impact.peak).toBeLessThanOrEqual(1);
      expect(impact.stroke[0]).toBeGreaterThan(impact.stroke[1]);
    }
  });

  it('makes the faint Numb ring present but half as strong, and gives it the one tap', () => {
    expect(WATER.numb.impact.peak).toBe(0.5);
    expect(WATER.numb.impact.peak).toBeGreaterThan(0);
    expect(WATER.numb.haptic).toBe('fine');
  });

  it('answers with a cue from the haptic vocabulary, heaviest for Heavy', () => {
    expect(WATER.light.haptic).toBe('fine');
    expect(WATER.steady.haptic).toBe('tick');
    expect(WATER.unsettled.haptic).toBe('tick');
    expect(WATER.heavy.haptic).toBe('settle');
  });
});
