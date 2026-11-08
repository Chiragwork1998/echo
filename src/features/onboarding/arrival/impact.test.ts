import { FLATTEN, WATER } from './geometry';
import { IMPACT_DELAY, HANDOVER, impactAt, standingDelay } from './impact';

const RX = 70;
const RY = 24;

describe('the ring that leaves a stone when it is chosen', () => {
  const { impact } = WATER.steady;

  it("starts on the stone's rim, unseen and at its heaviest line", () => {
    const start = impactAt(0, impact, RX, RY);
    expect(start.rx).toBe(RX);
    expect(start.ry).toBe(RY);
    expect(start.strokeOpacity).toBe(0);
    expect(start.strokeWidth).toBe(impact.stroke[0]);
  });

  it('spreads flatter than it is wide, by exactly its reach, as the river is seen at an angle', () => {
    const end = impactAt(1, impact, RX, RY);
    expect(end.rx).toBeCloseTo(RX + impact.reach);
    expect(end.ry).toBeCloseTo(RY + impact.reach * FLATTEN);
    expect(end.strokeWidth).toBeCloseTo(impact.stroke[1]);
  });

  it('is brightest a moment after it leaves the rim, and gone when it has spread', () => {
    const peak = impactAt(0.12, impact, RX, RY).strokeOpacity;
    expect(peak).toBeCloseTo(0.95 * impact.peak);
    expect(impactAt(1, impact, RX, RY).strokeOpacity).toBe(0);
    for (const p of [0.05, 0.3, 0.6, 0.9]) {
      expect(impactAt(p, impact, RX, RY).strokeOpacity).toBeLessThanOrEqual(peak);
    }
    // After the peak it only fades.
    let before = peak;
    for (const p of [0.2, 0.4, 0.6, 0.8, 0.95, 1]) {
      const now = impactAt(p, impact, RX, RY).strokeOpacity;
      expect(now).toBeLessThan(before);
      before = now;
    }
  });

  it('never leaves its range if the animation overshoots', () => {
    expect(impactAt(-0.2, impact, RX, RY).strokeOpacity).toBe(0);
    expect(impactAt(1.3, impact, RX, RY).strokeOpacity).toBe(0);
    expect(impactAt(1.3, impact, RX, RY).rx).toBeCloseTo(RX + impact.reach);
  });

  it('is half as strong for Numb, and still there', () => {
    const numb = impactAt(0.12, WATER.numb.impact, RX, RY).strokeOpacity;
    const steady = impactAt(0.12, WATER.steady.impact, RX, RY).strokeOpacity;
    expect(numb).toBeGreaterThan(0.3);
    expect(numb).toBeCloseTo(steady / 2);
  });
});

describe('when the standing rings take over', () => {
  it('waits for the impact ring to be mostly gone, then sends one ring every third of a cycle', () => {
    const { impact, cycle } = WATER.heavy;
    const lead = HANDOVER * impact.ms;
    expect(standingDelay(0, WATER.heavy, true)).toBeCloseTo(lead);
    expect(standingDelay(1, WATER.heavy, true)).toBeCloseTo(lead + cycle / 3);
    expect(standingDelay(2, WATER.heavy, true)).toBeCloseTo(lead + (2 * cycle) / 3);
  });

  it('starts at once, with no impact ring to wait for, when the stone was already chosen', () => {
    expect(standingDelay(0, WATER.steady, false)).toBe(0);
    expect(standingDelay(1, WATER.steady, false)).toBeCloseTo(5600 / 3);
  });

  it('leaves the stone alone for a beat before the ring leaves it', () => {
    expect(IMPACT_DELAY).toBe(40);
  });
});
