import { regionForTimeZone } from './supportResources';

/**
 * The country whose helplines to list, such as 'IN', or null. Where the person is matters for a
 * helpline, so the phone's time zone decides when it lies in a country the panel has lines for,
 * whatever language the phone is set to. Otherwise the region of the language settings decides, as
 * it always has. Both are read on the phone, only to choose which lines to list, and never sent.
 */
export function deviceRegion(): string | null {
  return regionForTimeZone(deviceTimeZone()) ?? languageRegion();
}

/** The time zone the phone's clock is set to, such as 'Asia/Kolkata', or null. */
function deviceTimeZone(): string | null {
  try {
    // Required here so that importing this file stays free of native modules in tests and on web.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCalendars } = require('expo-localization') as typeof import('expo-localization');
    return getCalendars()[0]?.timeZone ?? null;
  } catch {
    return null;
  }
}

/** The country the language settings name, such as 'US' for American English, or null. */
function languageRegion(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLocales } = require('expo-localization') as typeof import('expo-localization');
    const region = getLocales()[0]?.regionCode;
    if (region) return region.toUpperCase();
  } catch {
    // Fall through to the JavaScript runtime's own idea of the locale.
  }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = /[-_]([A-Za-z]{2})\b/.exec(locale)?.[1];
    return region ? region.toUpperCase() : null;
  } catch {
    return null;
  }
}
