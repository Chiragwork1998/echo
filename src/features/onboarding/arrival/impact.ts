import { FLATTEN, type Impact, type Water } from './geometry';

/** The beat after the touch before the ring leaves the stone, while the press glow takes hold. */
export const IMPACT_DELAY = 40;
/** The standing rings begin when the impact ring has run this much of its time. */
export const HANDOVER = 0.55;
/** Share of the ring's travel over which it comes to full strength, then it only fades. */
const RISE = 0.12;
/** The strongest a ring is drawn, as in the standing rings. */
const STRONGEST = 0.95;

/**
 * The impact ring at progress p (0 to 1, already eased): its radii, opacity and line weight. It
 * leaves the stone's rim at once, comes to full strength within the first eighth of its travel,
 * and thins and fades as it spreads. Runs on the UI thread, so it is plain arithmetic.
 */
export function impactAt(p: number, impact: Impact, rx: number, ry: number) {
  'worklet';
  const t = p < 0 ? 0 : p > 1 ? 1 : p;
  const rise = t < RISE ? t / RISE : (1 - t) / (1 - RISE);
  return {
    rx: rx + impact.reach * t,
    ry: ry + impact.reach * FLATTEN * t,
    strokeOpacity: STRONGEST * impact.peak * rise,
    strokeWidth: impact.stroke[0] + (impact.stroke[1] - impact.stroke[0]) * t,
  };
}

/**
 * When standing ring `index` first leaves the stone, in ms from the choice. With an impact ring,
 * the first waits until it is mostly gone; a stone that was already chosen has none to wait for.
 */
export function standingDelay(index: number, water: Water, afterImpact: boolean): number {
  const lead = afterImpact ? HANDOVER * water.impact.ms : 0;
  return lead + (index * water.cycle) / 3;
}
