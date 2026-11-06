// Pure time logic for the Rhythm dial. Angles are degrees clockwise from the top. The dial is a
// 24-hour face with noon at the top and midnight at the bottom, so 6 pm sits on the right and 6 am
// on the left, as in the golden. Functions marked 'worklet' also run on the UI thread, where the
// drag is handled.

export const MINUTES_PER_DAY = 1440;
export const SNAP_MINUTES = 5;
const NOON = 720;

export function wrapMinutes(minutes: number): number {
  'worklet';
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** Nearest 5 minutes, wrapping past midnight (23:58 becomes 00:00). */
export function snapMinutes(minutes: number): number {
  'worklet';
  return wrapMinutes(Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES);
}

export function minutesToAngle(minutes: number): number {
  'worklet';
  return (((wrapMinutes(minutes) - NOON) / MINUTES_PER_DAY) * 360 + 360) % 360;
}

export function angleToMinutes(angle: number): number {
  'worklet';
  return wrapMinutes((angle / 360) * MINUTES_PER_DAY + NOON);
}

/** Angle of a point relative to the dial centre, 0 at the top, increasing clockwise. */
export function pointToAngle(dx: number, dy: number): number {
  'worklet';
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/**
 * The angle equal to `target` that lies within half a turn of `from`. Animating to it takes the
 * short way round, so the handle never spins backwards across midnight.
 */
export function nearestAngle(from: number, target: number): number {
  'worklet';
  const delta = ((((target - from) % 360) + 540) % 360) - 180;
  return from + delta;
}

/** True when the hour changes between two times, including 23:55 to 00:00. */
export function crossesHour(previous: number, next: number): boolean {
  'worklet';
  return Math.floor(previous / 60) !== Math.floor(next / 60);
}

export function stepMinutes(minutes: number, delta: number): number {
  return wrapMinutes(minutes + delta);
}

/** Stored format: 24-hour HH:mm. Returns undefined for anything else. */
export function parseTime(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

export function formatTime(minutes: number): string {
  const wrapped = wrapMinutes(Math.round(minutes));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

export type ClockFormat = { locale?: string; hour12?: boolean };
export type ClockText = {
  /** Hours and minutes, such as "9:30". */
  main: string;
  /** AM or PM in 12-hour locales. */
  period?: string;
  /** The complete time as the device writes it, for screen readers. */
  spoken: string;
};

/** The time in the device's own format. 9:30 PM in en-US, 21:30 on a 24-hour clock. */
export function clockText(minutes: number, { locale, hour12 }: ClockFormat = {}): ClockText {
  const wrapped = wrapMinutes(Math.round(minutes));
  const date = new Date(2000, 0, 1, Math.floor(wrapped / 60), wrapped % 60);
  try {
    const format = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12 });
    const parts = format.formatToParts(date);
    const period = parts.find((part) => part.type === 'dayPeriod')?.value;
    const main = parts
      .filter((part) => part.type !== 'dayPeriod')
      .map((part) => part.value)
      .join('')
      .trim();
    return { main, period, spoken: format.format(date).replace(/\s/g, ' ') };
  } catch {
    const hours = Math.floor(wrapped / 60);
    const minute = String(wrapped % 60).padStart(2, '0');
    if (hour12 === false) return { main: formatTime(wrapped), spoken: formatTime(wrapped) };
    const period = hours < 12 ? 'AM' : 'PM';
    const main = `${hours % 12 || 12}:${minute}`;
    return { main, period, spoken: `${main} ${period}` };
  }
}
