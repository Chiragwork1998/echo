import { getCalendars, getLocales } from 'expo-localization';
import { useMemo } from 'react';

import { clockText, MINUTES_PER_DAY, SNAP_MINUTES, type ClockFormat, type ClockText } from './time';

/** The device's language and 12 or 24 hour setting, as it is right now. */
export function readClockFormat(): ClockFormat & { is24Hour: boolean } {
  let locale: string | undefined;
  let hour12: boolean | undefined;
  try {
    locale = getLocales()[0]?.languageTag;
    const uses24 = getCalendars()[0]?.uses24hourClock;
    hour12 = typeof uses24 === 'boolean' ? !uses24 : undefined;
  } catch {
    // Not available on this platform: Intl's own default applies.
  }
  const is24Hour =
    hour12 === undefined
      ? new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 === false
      : !hour12;
  return { locale, hour12, is24Hour };
}

/** The device's language and 12 or 24 hour setting, read once. */
export function useClockFormat(): ClockFormat & { is24Hour: boolean } {
  return useMemo(() => readClockFormat(), []);
}

export function useClockText(minutes: number): ClockText {
  const { locale, hour12 } = useClockFormat();
  return useMemo(() => clockText(minutes, { locale, hour12 }), [minutes, locale, hour12]);
}

/** Every time the dial can show (each 5 minutes of the day), as the device writes it. */
export type ClockTable = {
  /** Hours and minutes, such as "9:30", by minutes since midnight over 5. */
  mains: readonly string[];
  /** AM or PM by the same index, or empty strings where the clock has none. */
  periods: readonly string[];
  /** True when no time has an AM or PM: a 24-hour clock. */
  twentyFour: boolean;
};

const tables = new Map<string, ClockTable>();

/**
 * The dial's number is drawn on the UI thread, where the clock's formatter is not: it looks the time
 * up in a table made here, once, from the same formatter that writes the button's spoken name. The
 * table is the device's own wording (digits, separators, 12 or 24 hours), made for each format once.
 */
export function useClockTable(): ClockTable {
  const { locale, hour12 } = useClockFormat();
  return useMemo(() => {
    const key = `${locale ?? ''}|${hour12 ?? ''}`;
    let table = tables.get(key);
    if (!table) {
      const mains: string[] = [];
      const periods: string[] = [];
      for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += SNAP_MINUTES) {
        const text = clockText(minutes, { locale, hour12 });
        mains.push(text.main);
        periods.push(text.period ?? '');
      }
      table = { mains, periods, twentyFour: periods.every((period) => period === '') };
      tables.set(key, table);
    }
    return table;
  }, [locale, hour12]);
}
