import * as Haptics from 'expo-haptics';
import { AccessibilityInfo } from 'react-native';

import type { BreathPhase } from './engine';

/**
 * A soft tick as each breath in begins and a softer one as each breath out begins, so the rhythm can
 * be followed with the sound off and the eyes closed. Holds pass in stillness.
 */
export function tickFor(phase: BreathPhase): void {
  try {
    if (phase.action === 'inhale') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } else if (phase.action === 'exhale') {
      void Haptics.selectionAsync().catch(() => undefined);
    }
  } catch {
    // No haptics on this device.
  }
}

/** A moment that a bell would mark, with the sound off. */
export function tickMoment(): void {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  } catch {
    // No haptics on this device.
  }
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
