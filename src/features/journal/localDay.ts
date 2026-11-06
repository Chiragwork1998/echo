// A local day is the calendar date on the device's wall clock, stored as 'YYYY-MM-DD'. It is captured
// when an entry is committed and never recomputed. Re-deriving it from a UTC timestamp would move
// past entries to a different day whenever the user changes timezone.
//
// All arithmetic is on the calendar, through UTC midnights. Adding 24 hours to a local time is wrong
// twice a year: DST days are 23 and 25 hours long.

const MS_PER_DAY = 86_400_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type Clock = {
  now(): Date;
  localDay(at: Date): string;
};

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

export const formatDay = (year: number, month: number, day: number) =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

export const deviceClock: Clock = {
  now: () => new Date(),
  localDay: (at) => formatDay(at.getFullYear(), at.getMonth() + 1, at.getDate()),
};

/** UTC midnight of a local day, used only as a calendar coordinate. */
function coordinate(day: string): number | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const [, year, month, date] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(date));
}

export const isLocalDay = (value: unknown): value is string =>
  typeof value === 'string' && coordinate(value) !== null;

export function addDays(day: string, count: number): string {
  const at = new Date((coordinate(day) ?? 0) + count * MS_PER_DAY);
  return formatDay(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}

/** Whole calendar days from one day to another. 1 means `to` is the day after `from`. */
export const dayDistance = (from: string, to: string) =>
  Math.round(((coordinate(to) ?? 0) - (coordinate(from) ?? 0)) / MS_PER_DAY);

/** 0 for Monday through 6 for Sunday, matching the Home week strip. */
export function weekdayIndex(day: string): number {
  return (new Date(coordinate(day) ?? 0).getUTCDay() + 6) % 7;
}
