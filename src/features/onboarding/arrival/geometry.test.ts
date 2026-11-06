import { copy } from '@/content/copy';

import { MIN_HIT, STONES, hitBox } from './geometry';

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
