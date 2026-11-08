import { AccessibilityInfo } from 'react-native';

import { cue } from '@/design/haptics';

import type { BreathPhase } from './engine';

/**
 * A soft tick as each breath in begins and a softer one as each breath out begins, so the rhythm can
 * be followed with the sound off and the eyes closed. Holds pass in stillness.
 */
export function tickFor(phase: BreathPhase): void {
  if (phase.action === 'inhale') cue('breathIn');
  else if (phase.action === 'exhale') cue('breathOut');
}

/** A moment that a bell would mark, with the sound off. */
export function tickMoment(): void {
  cue('moment');
}

/**
 * Says something to a screen reader once, after whatever it is already saying: queued, never
 * interrupting. Only called while one is running.
 */
export function announce(message: string): void {
  try {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  } catch {
    // Nothing to tell.
  }
}
