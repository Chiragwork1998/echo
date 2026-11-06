// Text visible in the goldens but missing from COPY_DECK.md. Screens may use it so they can match
// the golden, but it is NOT locked copy until the owner approves it (docs/SPEC_CONFLICTS.md, C-09).
export const goldenCopy = {
  dayHomeSubtitle: 'A calmer mind creates a kinder you.',
  seeAll: 'See all',
  dayRhythm: (days: number) => `${days} day rhythm`,
  nightBegin: 'Begin',
  nightBeginArc: 'Your seven minutes',
  nightSpeakInstead: 'Speak instead',
  nightRhythm: (count: number) =>
    `${count} ${count === 1 ? 'reflection' : 'reflections'} · your rhythm is taking shape`,
  minutesLeft: (minutes: number) => `${minutes} min left`,
} as const;
