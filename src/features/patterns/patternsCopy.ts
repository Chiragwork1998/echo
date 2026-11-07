import { copy } from '@/content/copy';
import { specCopy } from '@/content/specCopy';
import { PATTERNS_ENTRY_CHARS, PATTERNS_SEND_LIMIT } from '@/services/patterns';

/**
 * WORKING COPY. The counts below state plain facts and nothing else: no interpretation, no advice and
 * no claim about the person. The pattern cards, the consent, and the support message are also working
 * copy, and the consent and the support message need the owner's and legal review before release (see
 * supportResources.ts). The locked line is the spec's, in specCopy. None of the rest is locked: the
 * owner approves or replaces it when the designs arrive.
 */
export const patternsCopy = {
  title: copy.home.tabs[2],
  locked: specCopy.patternsLocked,
  loading: 'Counting your echoes',
  loadError: 'Your echoes couldn’t be loaded.',
  intro: 'Counts from your own echoes, worked out on this phone.',
  weekTitle: 'This week',
  reflections: (count: number) => (count === 1 ? '1 reflection' : `${count} reflections`),
  totalTitle: 'In total',
  minutesTotal: (minutes: number) => `${minutes} min of reflection in total`,
  moodTitle: 'Mood you chose on arrival',
  moodCount: (label: string, count: number) => `${label}, ${count}`,
  weeksTitle: 'Week by week',
  thisWeek: 'This week',
  lastWeek: 'Last week',
  weekOf: (date: string) => `Week of ${date}`,
  noMood: 'No mood chosen',
  skipped: (count: number) =>
    count === 1
      ? '1 echo can’t be opened, so it isn’t counted here.'
      : `${count} echoes can’t be opened, so they aren’t counted here.`,

  cards: {
    title: 'Pattern cards',
    intro:
      'ECHO can read your latest entries and name what keeps returning, in a few quiet cards. Only the words in your entries are used, whether you wrote or spoke them, and each quote is checked against them.',
    read: 'Read my patterns',
    readAgain: 'Read again',
    // Shown once the free reading has been made, to someone without ECHO Plus.
    plusNote: 'New readings are part of ECHO Plus.',
    reading: 'Reading your entries. This can take a minute.',
    readOn: (date: string) => `Read on ${date}`,
    fromEntries: (count: number) =>
      count === 1 ? 'from 1 entry' : `from your latest ${count} entries`,
    cardOf: (index: number, total: number) => `${index} of ${total}`,
    brand: '✦ ECHO ✦',
    eyebrow: 'The Pattern',
    inYourWords: 'In your words',
    aWayToSeeIt: 'A way to see it',
    ideaFrom: (source: string) => `Idea from ${source}`,
    tryThis: 'Try, for under two minutes',
    askYourself: 'Ask yourself',
    reflectionNote: 'A reflection from your own words. Not therapy, diagnosis or advice.',
    none: 'Nothing clear enough to name yet. A few more entries will help.',
    keptEarlier: 'Your earlier cards are still here.',
    offline: 'Couldn’t reach the reader just now. You can try again whenever you like.',
    busy: 'You’ve asked a few times in a short while. Try again a little later.',
    failed: 'The reading didn’t finish. You can try again in a moment.',
    notConfigured: 'Pattern cards aren’t available in this build of ECHO.',
    /** The free reading is used (docs/PRODUCT_V1.md, ECHO Plus). Offered with `getPlus`. */
    allowanceUsed:
      'Your free reading has been used. With ECHO Plus, ECHO reads your patterns whenever you ask.',
    /** ECHO Plus's readings for the month are used. Rare, and said plainly. */
    readingCap: 'This month’s readings are used. More come next month.',
    getPlus: 'Get ECHO Plus',
    notKept: 'These cards couldn’t be kept on this phone, so they’ll be gone when you close ECHO.',
    noEntries: 'Your entries couldn’t be opened just now. Try again in a moment.',
    cardLabel: (name: string, index: number, total: number) =>
      `Pattern card ${index} of ${total}: ${name}`,
  },
  consent: {
    title: 'Before ECHO reads your entries',
    lead: 'Pattern cards are made by sending your entries to be read. Separate from voice, this is asked once, here.',
    sends: (count: number) =>
      count >= PATTERNS_SEND_LIMIT
        ? `ECHO will send your latest ${PATTERNS_SEND_LIMIT} entries.`
        : count === 1
          ? 'ECHO will send your 1 entry.'
          : `ECHO will send your ${count} entries.`,
    limit: `At most ${PATTERNS_SEND_LIMIT} entries are sent, the newest first, and the first ${PATTERNS_ENTRY_CHARS.toLocaleString('en')} characters of each.`,
    facts: [
      'Your entries are sent to OpenAI, over a secure connection, to be read.',
      'OpenAI does not use them to train its models.',
      'OpenAI may keep them for up to 30 days to check for abuse, then deletes them.',
      'ECHO’s own server keeps none of your voice or words.',
      'The cards are kept on this phone, encrypted.',
      'You can withdraw this at any time, here in Patterns.',
    ],
    agree: 'I agree, read my entries',
    notNow: 'Not now',
  },
  choices: {
    title: 'Your choices',
    withdraw: 'Stop sending my entries',
    withdrawDetail: 'ECHO will ask again before it reads. Cards already made stay on this phone.',
    withdrawn: 'Agreement withdrawn. ECHO will ask again before reading.',
    deleteCards: 'Delete these cards',
    deleteDetail: 'Removes them from this phone.',
  },
} as const;
