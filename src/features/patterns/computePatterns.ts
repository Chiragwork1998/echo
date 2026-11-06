import { addDays, weekdayIndex, type EntrySummary } from '@/features/journal';
import type { Mood } from '@/state/onboarding';

export const PATTERNS_MIN = 5;
export const WEEKS_SHOWN = 4;

export type MoodCounts = Record<Mood, number>;

export type WeekCounts = {
  /** The Monday this week began on, 'YYYY-MM-DD'. */
  start: string;
  reflections: number;
  moods: MoodCounts;
  /** Entries this week where no mood was chosen. */
  noMood: number;
};

export type Patterns = {
  /** Every committed echo, including any that cannot be opened. */
  reflections: number;
  unreadable: number;
  /** Fewer than PATTERNS_MIN committed echoes: nothing is shown. */
  unlocked: boolean;
  thisWeek: number;
  totalMinutes: number;
  moodTotals: MoodCounts;
  /** Newest first, the current week then the ones before it. */
  weeks: WeekCounts[];
};

const noMoods = (): MoodCounts => ({ light: 0, steady: 0, unsettled: 0, heavy: 0, numb: 0 });

/**
 * Counts and sums, nothing more. All of it comes from the echoes themselves, on this phone: no
 * model, no scoring, no reading between the lines. Weeks run Monday to Sunday, as on Home, by each
 * echo's own local day, so changing timezone never moves one.
 */
export function computePatterns(entries: readonly EntrySummary[], today: string): Patterns {
  const monday = addDays(today, -weekdayIndex(today));
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, back): WeekCounts => {
    const start = addDays(monday, -7 * back);
    return { start, reflections: 0, moods: noMoods(), noMood: 0 };
  });
  const moodTotals = noMoods();
  let seconds = 0;
  let unreadable = 0;

  for (const entry of entries) {
    if (!entry.readable) {
      unreadable += 1;
      continue;
    }
    seconds += entry.durationSeconds;
    // A mood this version does not know is counted as none rather than as NaN.
    const mood = entry.moodBefore && entry.moodBefore in moodTotals ? entry.moodBefore : undefined;
    if (mood) moodTotals[mood] += 1;
    const day = entry.localDay;
    const week = day && weeks.find(({ start }) => day >= start && day <= addDays(start, 6));
    if (!week) continue;
    week.reflections += 1;
    if (mood) week.moods[mood] += 1;
    else week.noMood += 1;
  }

  return {
    reflections: entries.length,
    unreadable,
    unlocked: entries.length >= PATTERNS_MIN,
    thisWeek: weeks[0]?.reflections ?? 0,
    totalMinutes: Math.round(seconds / 60),
    moodTotals,
    weeks,
  };
}
