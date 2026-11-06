// Words the interaction spec gives for states the copy deck does not cover: empty, loading, error,
// offline and success. Each line is checked against product-handoff/specs/INTERACTIONS_AND_STATES.md
// by specCopy.test.ts. This is the one home for them: screens import from here and never retype a
// string. A line that is also in COPY_DECK.md belongs in copy.ts instead.
export const specCopy = {
  /** Empty: Home's recent section, and the Echoes archive with no entries. */
  emptyEchoes: 'Your first echo will appear here.',
  /** Empty: Patterns before there is enough to show. */
  patternsLocked: 'Patterns become visible after 5 reflections.',
  /** Empty: a search that matched nothing. */
  noMatches: 'Nothing returned for that search.',
  /** Loading: the reflection card while a reflection is being made. */
  reflectionListening: 'Listening for what returned…',
  /** Error: the reflection could not be made. Offer Try again and Continue. */
  reflectionError: 'Your words are saved. The reflection can wait.',
  /** Offline: the small, non-blocking note beside a draft that is safe on the device. */
  savedOnDevice: 'Saved on this device',
  /** Success: a reminder was scheduled. `time` is written in the device's own format. */
  reminderScheduled: (time: string) => `We’ll meet you at ${time}.`,
} as const;
