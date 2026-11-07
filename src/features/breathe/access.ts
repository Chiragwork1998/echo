import { DEFAULT_PACE, LENGTHS } from './timeline';
import type { Practice } from './types';

/** Free at this length. A practice marked free is free at every length. */
export function freeAt(practice: Practice, minutes: number): boolean {
  if (typeof practice.free === 'boolean') return practice.free;
  return practice.free.minutes.includes(minutes);
}

/** Free at some length, so it can be opened without ECHO Plus. */
export function freeAtAll(practice: Practice): boolean {
  return LENGTHS.some((minutes) => freeAt(practice, minutes)) || freeAt(practice, practice.minutes);
}

/** Your pace is Plus. The default pace is everyone's. */
export const paceIsFree = (pace: number) => pace === DEFAULT_PACE;

/**
 * The length a practice opens at: the one last chosen for it, if it may still be used, else its own
 * default if that is free, else the first free length.
 */
export function openingLength(practice: Practice, remembered: number | undefined, plus: boolean) {
  const usable = (minutes: number) => plus || freeAt(practice, minutes);
  if (remembered !== undefined && usable(remembered)) return remembered;
  if (usable(practice.minutes)) return practice.minutes;
  return LENGTHS.find(usable) ?? practice.minutes;
}

/** The lengths offered: the practice's own, then the usual four, in order. */
export function lengthsFor(practice: Practice): number[] {
  return [...new Set([practice.minutes, ...LENGTHS])].sort((a, b) => a - b);
}
