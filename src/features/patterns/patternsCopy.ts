import { copy } from '@/content/copy';
import { specCopy } from '@/content/specCopy';

/**
 * WORKING COPY. Patterns states plain counts and nothing else: no interpretation, no advice and no
 * claim about the person. The locked line is the spec's, in specCopy. None of the rest is locked: the
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
} as const;
