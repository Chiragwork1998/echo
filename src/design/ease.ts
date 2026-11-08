import { Easing } from 'react-native-reanimated';

/**
 * ECHO's motion: decelerating into place (docs/DESIGN_QUALITY.md). One curve, named once, so every
 * moment that moves shares it. The jest mock's Easing.bezier is the identity: never call .factory().
 */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Clamps to 0..1, on the UI thread. */
export function clamp01(value: number): number {
  'worklet';
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The smooth 0..1 ramp between two edges, on the UI thread: eases in and out with no kink. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  'worklet';
  if (edge1 === edge0) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
