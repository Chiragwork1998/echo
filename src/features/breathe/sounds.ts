import type { Bell } from './timeline';
import type { Pattern } from './types';

/**
 * The breath sounds, made by scripts/generate-breath-audio.mjs: each loop is exactly one round of its
 * pattern, starting as the breath in begins, and loops back at the quiet end of the breath out.
 */
const LOOPS: Record<string, number> = {
  sigh: require('../../../assets/breathe/sound/sigh.wav'),
  'paced-4-0-4-0': require('../../../assets/breathe/sound/paced-4-0-4-0.wav'),
  'paced-4-0-6-0': require('../../../assets/breathe/sound/paced-4-0-6-0.wav'),
  'paced-4-0-8-0': require('../../../assets/breathe/sound/paced-4-0-8-0.wav'),
  'paced-4-0-8-0-hum': require('../../../assets/breathe/sound/paced-4-0-8-0-hum.wav'),
  'paced-4-4-4-4': require('../../../assets/breathe/sound/paced-4-4-4-4.wav'),
  'paced-4-7-8-0': require('../../../assets/breathe/sound/paced-4-7-8-0.wav'),
  'heart-45': require('../../../assets/breathe/sound/heart-45.wav'),
  'heart-50': require('../../../assets/breathe/sound/heart-50.wav'),
  'heart-55': require('../../../assets/breathe/sound/heart-55.wav'),
  'heart-60': require('../../../assets/breathe/sound/heart-60.wav'),
  'heart-65': require('../../../assets/breathe/sound/heart-65.wav'),
};

export const BELLS: Record<Bell, number> = {
  open: require('../../../assets/breathe/sound/bell-open.wav'),
  moment: require('../../../assets/breathe/sound/bell.wav'),
  close: require('../../../assets/breathe/sound/bell-close.wav'),
};

/** The name a pattern's loop is made under. */
export function loopName(pattern: Pattern, pace: number): string {
  switch (pattern.kind) {
    case 'sigh':
      return pattern.inhale === 2.5 && pattern.topUp === 1 && pattern.exhale === 6
        ? 'sigh'
        : `sigh-${pattern.inhale}-${pattern.topUp}-${pattern.exhale}`;
    case 'paced': {
      const { inhale, holdIn = 0, exhale, holdOut = 0, hum } = pattern;
      return `paced-${inhale}-${holdIn}-${exhale}-${holdOut}${hum ? '-hum' : ''}`;
    }
    case 'heart':
      return `heart-${Math.round(pace * 10)}`;
  }
}

/**
 * The sound for a pattern, or null when no loop was made for it. A pattern without one is still
 * breathed in full, by its haptics and on screen, on a clock of its own.
 */
export function loopFor(pattern: Pattern, pace: number): number | null {
  return LOOPS[loopName(pattern, pace)] ?? null;
}
