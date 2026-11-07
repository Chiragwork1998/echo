import type { PracticePrefs } from '@/state/preferences';

/** Skipped on this many mornings in a row, Arrive stops being offered. */
export const ARRIVE_SKIP_LIMIT = 3;

/** Whether the morning session still opens with Arrive. */
export const arriveOffered = (practice: Pick<PracticePrefs, 'arriveSkips'>) =>
  practice.arriveSkips < ARRIVE_SKIP_LIMIT;

/**
 * Counts a morning's skip once, however many times it is skipped that morning. A morning it runs to
 * the end starts the count again.
 */
export function afterArrive(
  practice: Pick<PracticePrefs, 'arriveSkips' | 'arriveSkipDay'>,
  finished: boolean,
  day: string,
): Pick<PracticePrefs, 'arriveSkips' | 'arriveSkipDay'> {
  if (finished) return { arriveSkips: 0, arriveSkipDay: null };
  if (practice.arriveSkipDay === day) return practice;
  return { arriveSkips: practice.arriveSkips + 1, arriveSkipDay: day };
}
