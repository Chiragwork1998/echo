import { addDays, dayDistance, isLocalDay, weekdayIndex } from './localDay';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type RhythmDay = {
  day: string;
  weekday: Weekday;
  completed: boolean;
  isToday: boolean;
};

export type Rhythm = {
  today: string;
  /** Monday to Sunday of the current week, always seven days. */
  week: RhythmDay[];
  /** Entries committed this week. The Night Home "N reflections". */
  weekReflections: number;
  /** Consecutive completed days. The Day Home "N day rhythm". */
  currentStreak: number;
  totalDays: number;
  totalReflections: number;
};

export type DayCount = { day: string; count: number };

/**
 * Always computed from the entries that exist, never stored, so deleting an entry or a corrupted
 * value cannot leave a wrong number behind.
 */
export function deriveRhythm(rows: DayCount[], today: string): Rhythm {
  const counts = new Map<string, number>();
  for (const { day, count } of rows) {
    if (isLocalDay(day)) counts.set(day, (counts.get(day) ?? 0) + count);
  }

  const monday = addDays(today, -weekdayIndex(today));
  const week = WEEKDAYS.map((weekday, index): RhythmDay => {
    const day = addDays(monday, index);
    return { day, weekday, completed: counts.has(day), isToday: day === today };
  });

  return {
    today,
    week,
    weekReflections: week.reduce((total, { day }) => total + (counts.get(day) ?? 0), 0),
    currentStreak: streakEndingNear(counts, today),
    totalDays: counts.size,
    totalReflections: [...counts.values()].reduce((total, count) => total + count, 0),
  };
}

function streakEndingNear(counts: Map<string, number>, today: string): number {
  if (counts.size === 0) return 0;
  const latest = [...counts.keys()].reduce((a, b) => (a > b ? a : b));
  // Flying west over the date line can make today earlier than the last entry's day. That entry was
  // real, so count from it instead of treating the streak as broken.
  let cursor = dayDistance(today, latest) > 0 ? latest : today;
  // Today not done yet leaves the streak alive: it runs until the day ends.
  if (!counts.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (counts.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
