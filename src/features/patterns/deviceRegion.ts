/**
 * The country the phone is set to, such as 'IN', or null. It only chooses which helplines to list. It
 * is read from the language settings and never from where the phone is.
 */
export function deviceRegion(): string | null {
  try {
    // Required here so that importing this file stays free of native modules in tests and on web.
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
