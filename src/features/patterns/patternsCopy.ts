import { copy } from '@/content/copy';

/**
 * WORKING COPY. Patterns states plain counts and nothing else: no interpretation, no advice and no
 * claim about the person. The locked line is from INTERACTIONS_AND_STATES.md and is not in copy.ts
 * yet. None of this is locked: the owner approves or replaces it when the designs arrive.
 */
export const patternsCopy = {
  title: copy.home.tabs[2],
  locked: 'Patterns become visible after 5 reflections.',
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
} as const;
