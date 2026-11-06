import { getCalendars, getLocales } from 'expo-localization';
import { useMemo } from 'react';

import { clockText, type ClockFormat, type ClockText } from './time';

/** The device's language and 12 or 24 hour setting, read once. */
export function useClockFormat(): ClockFormat & { is24Hour: boolean } {
  return useMemo(() => {
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
  }, []);
}

export function useClockText(minutes: number): ClockText {
  const { locale, hour12 } = useClockFormat();
  return useMemo(() => clockText(minutes, { locale, hour12 }), [minutes, locale, hour12]);
}
