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
  /** Under the locked line: how far along the person is, or what counts. */
  lockedSoFar: (count: number, needed: number) =>
    count === 0 ? 'Each echo you keep on Today counts.' : `${count} of ${needed} so far.`,
  /** The cairns above it, for a screen reader. */
  lockedSpoken: (count: number, needed: number) => `${count} of ${needed} reflections`,
  loading: 'Counting your echoes',
  loadError: 'Your echoes couldn’t be loaded.',
  rhythmTitle: 'Your rhythm',
  intro: 'Counts from your own echoes, worked out on this phone.',
  /** The foot of the summary, once it also counts breath practices. */
  introWithBreath: 'Counts from your own echoes and practices, worked out on this phone.',
  weekTitle: 'This week',
  reflections: (count: number) => (count === 1 ? '1 reflection' : `${count} reflections`),
  minutesTotal: (minutes: number) => `${minutes} min of reflection in total`,
  moodTitle: 'Mood you chose on arrival',
  moodCount: (label: string, count: number) => `${label}, ${count}`,
  weeksTitle: 'Week by week',
  thisWeek: 'This week',
  lastWeek: 'Last week',
  weekOf: (date: string) => `Week of ${date}`,
  /** Breathe's practices, from the counts of how the person felt after each. */
  breathTitle: 'Breathing',
  /** "6 practices this week. Calmer after 4." Calmer is left unsaid when no practice ended calmer. */
  breathWeek: (practices: number, calmer: number) => {
    const done = practices === 1 ? '1 practice this week.' : `${practices} practices this week.`;
    return calmer > 0 ? `${done} Calmer after ${calmer}.` : done;
  },
  helpsMost: (name: string) => `${name} helps you most often.`,
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
    // Spoken with each part of a card, so a screen reader can tell them apart. The page shows the
    // parts by how they are set, and only the practice keeps its words as a lead into the sentence.
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
    /** Under a new card lying face down. */
    turnHint: 'Tap the card to turn it over.',
    turnOver: 'Turn it over.',
    faceDown: (index: number, total: number) => `Pattern card ${index} of ${total}, face down.`,
  },
  /**
   * Reporting a card (docs/PRODUCT_V1.md, See: Google Play's AI content policy). A report carries the
   * reason, the lens, the model and the app's version, and nothing the card or the person said.
   */
  report: {
    action: 'Report this card',
    actionSpoken: (name: string) => `Report this card: ${name}`,
    title: 'Report this card',
    lead: 'What is wrong with it?',
    privacy:
      'ECHO receives only the reason you choose, the idea and the model behind the card, and the app’s version. Never the card’s words, or yours.',
    reasons: {
      harmful: 'Harmful',
      wrong: 'Wrong about me',
      upsetting: 'Upsetting',
      other: 'Something else',
    },
    reasonsLabel: 'Reasons',
    send: 'Send report',
    chooseFirst: 'Choose a reason first',
    cancel: 'Cancel',
    sentTitle: 'Report sent',
    /** Where the report action was, on a card reported in this sitting. */
    reported: 'Reported',
    sentBody: 'Thank you for telling ECHO.',
    keptTitle: 'Kept to send later',
    /** ECHO could not take it now: a server without the report route, busy, or not answering. */
    keptBody: 'The report waits on this phone and goes to ECHO the next time you open Patterns.',
    /** The same, said only when the phone itself reports no connection. */
    offlineBody:
      'There’s no connection just now. The report waits on this phone and goes to ECHO the next time you open Patterns.',
    failedTitle: 'The report couldn’t be sent',
    failedBody: 'Nothing was sent. You can try again.',
    tryAgain: 'Try again',
    done: 'Done',
  },
  /**
   * The one reading agreement (D-017). Asked here before a reading, and on Completion from the saved
   * card, never while someone journals; the same facts in both places. Spoken entries are set out
   * under the voice agreement, which says so, so this speaks of what is written.
   */
  consent: {
    title: 'Before ECHO reads your entries',
    lead: 'One agreement, separate from voice, covers three things: today’s echo after each entry you keep, setting out what you write in paragraphs with every word kept, and pattern cards when you ask.',
    sends: (count: number) =>
      count >= PATTERNS_SEND_LIMIT
        ? `ECHO will send your latest ${PATTERNS_SEND_LIMIT} entries.`
        : count === 1
          ? 'ECHO will send your 1 entry.'
          : `ECHO will send your ${count} entries.`,
    /** On Completion, where the entry just kept is the first that would be read. */
    sendsKept: 'ECHO will send the entry you’ve just kept, and each one after it.',
    limit: `At most ${PATTERNS_SEND_LIMIT} entries are sent, the newest first, and the first ${PATTERNS_ENTRY_CHARS.toLocaleString('en')} characters of each.`,
    facts: [
      'Your entries are sent to OpenAI, over a secure connection, to be read.',
      'OpenAI does not use them to train its models.',
      'OpenAI may keep them for up to 30 days to check for abuse, then deletes them.',
      'ECHO’s own server keeps none of your voice or words.',
      'What comes back is kept on this phone, encrypted.',
      'You can withdraw this at any time, in Patterns.',
    ],
    agree: 'I agree, read my entries',
    notNow: 'Not now',
  },
  choices: {
    title: 'Your choices',
    withdraw: 'Stop sending my entries',
    withdrawDetail:
      'Today’s echo, setting out what you write, and pattern cards all stop. ECHO will ask again before it reads. What it has made stays on this phone.',
    withdrawn: 'Agreement withdrawn. ECHO will ask again before reading.',
    deleteCards: 'Delete these cards',
    deleteDetail: 'Removes them from this phone.',
  },
} as const;
