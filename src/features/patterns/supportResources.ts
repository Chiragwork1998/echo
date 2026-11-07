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
