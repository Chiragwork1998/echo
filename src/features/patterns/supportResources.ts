// What ECHO shows, in place of pattern cards, when a person's entries hold language about suicide or
// self-harm. The server decides that and sends no cards. This file decides what the person sees.
//
// PENDING REVIEW. product-handoff/specs/PRODUCT_REQUIREMENTS.md says crisis-resource copy is shown
// "only after legal/product review". Until the owner and counsel have approved the words below and
// the list of lines, they are WORKING COPY and the owner must not ship them as final.
// The words are adapted from the earlier ECHO prototype's crisis copy.
//
// Every number here was read on its operator's own page on 2026-11-06, except Tele-MANAS (India),
// which was confirmed in several Press Information Bureau releases found by search, because the
// ministry's own pages refused automated access that day. The owner should confirm 14416 by hand.
// No emergency number is printed: a person is told to use their local one. Numbers change, so
// re-check every line before each release.

export const SUPPORT_REVIEW = {
  status: 'pending',
  /** The date every line below was last read at its source. */
  numbersCheckedOn: '2026-11-06',
} as const;

export type SupportLine = {
  name: string;
  /** What to say aloud for the number, as printed. */
  contact: string;
  /** A tel: or sms: link. Only for numbers read at their operator's page. */
  link: string;
  detail: string;
};

/** By country code. A country not listed gets the directory alone. */
export const SUPPORT_LINES: Readonly<Record<string, readonly SupportLine[]>> = {
  IN: [
    {
      name: 'Tele-MANAS',
      contact: '14416',
      link: 'tel:14416',
      detail: 'Government of India. Free, day and night, in many languages.',
    },
  ],
  US: [
    {
      name: '988 Suicide & Crisis Lifeline',
      contact: '988',
      link: 'tel:988',
      detail: 'Call or text, free, day and night.',
    },
  ],
  CA: [
    {
      name: '9-8-8 Suicide Crisis Helpline',
      contact: '9-8-8',
      link: 'tel:988',
      detail: 'Call or text, day and night.',
    },
  ],
  GB: [
    {
      name: 'Samaritans',
      contact: '116 123',
      link: 'tel:116123',
      detail: 'Free to call, day and night.',
    },
  ],
  IE: [
    {
      name: 'Samaritans',
      contact: '116 123',
      link: 'tel:116123',
      detail: 'Free to call, day and night.',
    },
  ],
  AU: [
    {
      name: 'Lifeline',
      contact: '13 11 14',
      link: 'tel:131114',
      detail: 'Call any time. You can also text 0477 13 11 14.',
    },
  ],
  NZ: [
    {
      name: '1737 Need to talk?',
      contact: '1737',
      link: 'tel:1737',
      detail: 'Call or text, free, day and night.',
    },
  ],
};

/**
 * The time zones that lie in a country above, by their exact names, so that a phone's clock can say
 * where it is. Each list is every zone the IANA time zone database places in that country (zone.tab,
 * release 2026f), then the older names of those zones that some phones still report, such as
 * Asia/Calcutta. A zone that is shared with another country, such as America/Nassau, which keeps
 * Toronto's time in the Bahamas, is left out: it says nothing, and the language settings decide.
 */
export const SUPPORT_TIME_ZONES: Readonly<Record<string, readonly string[]>> = {
  IN: ['Asia/Kolkata', 'Asia/Calcutta'],
  US: [
    'America/Adak',
    'America/Anchorage',
    'America/Boise',
    'America/Chicago',
    'America/Denver',
    'America/Detroit',
    'America/Indiana/Indianapolis',
    'America/Indiana/Knox',
    'America/Indiana/Marengo',
    'America/Indiana/Petersburg',
    'America/Indiana/Tell_City',
    'America/Indiana/Vevay',
    'America/Indiana/Vincennes',
    'America/Indiana/Winamac',
    'America/Juneau',
    'America/Kentucky/Louisville',
    'America/Kentucky/Monticello',
    'America/Los_Angeles',
    'America/Menominee',
    'America/Metlakatla',
    'America/New_York',
    'America/Nome',
    'America/North_Dakota/Beulah',
    'America/North_Dakota/Center',
    'America/North_Dakota/New_Salem',
    'America/Phoenix',
    'America/Sitka',
    'America/Yakutat',
    'Pacific/Honolulu',
    'America/Atka',
    'America/Fort_Wayne',
    'America/Indianapolis',
    'America/Knox_IN',
    'America/Louisville',
    'America/Shiprock',
    'Navajo',
    'US/Alaska',
    'US/Aleutian',
    'US/Arizona',
    'US/Central',
    'US/East-Indiana',
    'US/Eastern',
    'US/Hawaii',
    'US/Indiana-Starke',
    'US/Michigan',
    'US/Mountain',
    'US/Pacific',
  ],
  CA: [
    'America/Atikokan',
    'America/Blanc-Sablon',
    'America/Cambridge_Bay',
    'America/Creston',
    'America/Dawson',
    'America/Dawson_Creek',
    'America/Edmonton',
    'America/Fort_Nelson',
    'America/Glace_Bay',
    'America/Goose_Bay',
    'America/Halifax',
    'America/Inuvik',
    'America/Iqaluit',
    'America/Moncton',
    'America/Rankin_Inlet',
    'America/Regina',
    'America/Resolute',
    'America/St_Johns',
    'America/Swift_Current',
    'America/Toronto',
    'America/Vancouver',
    'America/Whitehorse',
    'America/Winnipeg',
    'America/Coral_Harbour',
    'America/Montreal',
    'America/Nipigon',
    'America/Pangnirtung',
    'America/Rainy_River',
    'America/Thunder_Bay',
    'America/Yellowknife',
    'Canada/Atlantic',
    'Canada/Central',
    'Canada/Eastern',
    'Canada/Mountain',
    'Canada/Newfoundland',
    'Canada/Pacific',
    'Canada/Saskatchewan',
    'Canada/Yukon',
  ],
  GB: ['Europe/London', 'Europe/Belfast', 'GB', 'GB-Eire'],
  IE: ['Europe/Dublin', 'Eire'],
  AU: [
    'Antarctica/Macquarie',
    'Australia/Adelaide',
    'Australia/Brisbane',
    'Australia/Broken_Hill',
    'Australia/Darwin',
    'Australia/Eucla',
    'Australia/Hobart',
    'Australia/Lindeman',
    'Australia/Lord_Howe',
    'Australia/Melbourne',
    'Australia/Perth',
    'Australia/Sydney',
    'Australia/ACT',
    'Australia/Canberra',
    'Australia/Currie',
    'Australia/LHI',
    'Australia/NSW',
    'Australia/North',
    'Australia/Queensland',
    'Australia/South',
    'Australia/Tasmania',
    'Australia/Victoria',
    'Australia/West',
    'Australia/Yancowinna',
  ],
  NZ: ['Pacific/Auckland', 'Pacific/Chatham', 'NZ', 'NZ-CHAT'],
};

const COUNTRY_OF_ZONE: ReadonlyMap<string, string> = new Map(
  Object.entries(SUPPORT_TIME_ZONES).flatMap(([country, zones]) =>
    zones.map((zone) => [zone, country] as const),
  ),
);

/** The country a time zone lies in, by its exact name, when the panel has lines there. Else null. */
export function regionForTimeZone(zone: string | null | undefined): string | null {
  return (zone && COUNTRY_OF_ZONE.get(zone)) || null;
}

/** A directory of free helplines in many countries, run by ThroughLine. Offered for everyone. */
export const SUPPORT_DIRECTORY = {
  name: 'Find a Helpline',
  host: 'findahelpline.com',
  link: 'https://findahelpline.com',
} as const;

/** The country from a device region code such as 'IN', or null if none is known. */
export function supportLinesFor(region: string | null | undefined): readonly SupportLine[] {
  return (region && SUPPORT_LINES[region.toUpperCase()]) || [];
}

/** The heart of it, said wherever the panel opens. */
const reach =
  'If any part of you is thinking about ending your life or hurting yourself, please reach a person who can stay with you through it. You don’t have to explain it well. You only have to reach.';

export const supportCopy = {
  title: 'It sounds like you’re carrying something heavy.',
  /** After a reading the server answered with care instead of cards. */
  body: `ECHO has set the pattern cards aside this time. ${reach}`,
  /** Anywhere else the panel is offered, such as after a practice. */
  reach,
  /** Opened by the person from You, at any time: ECHO has heard nothing, so it assumes nothing. */
  openTitle: 'If you are struggling, talk to someone now.',
  linesTitle: 'Someone you can talk to now',
  directoryTitle: 'Helplines in other countries',
  directoryAction: `Open ${SUPPORT_DIRECTORY.host}`,
  noLocalLine: 'Free helplines, by country.',
  emergency:
    'If you might act on these thoughts, or you are in danger, call your local emergency number now.',
  call: (name: string, contact: string) => `Call ${name}, ${contact}`,
  footer: 'ECHO isn’t a crisis service and can’t take the place of one. Your entries stay yours.',
  callWord: 'Call',
  close: 'Close',
} as const;
