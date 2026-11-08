import { clamp01, smoothstep } from './ease';

describe('ease helpers', () => {
  it('clamps to 0..1', () => {
    expect([-1, 0, 0.4, 1, 2].map(clamp01)).toEqual([0, 0, 0.4, 1, 1]);
  });

  it('ramps smoothly between two edges, flat at both ends', () => {
    expect(smoothstep(0, 1, -0.5)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0.2, 0.6, 0.4)).toBeCloseTo(0.5);
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.6)).toBe(1);
  });
});
