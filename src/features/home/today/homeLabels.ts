import { copy } from '@/content/copy';
import { dayDistance, type EntrySummary } from '@/features/journal';

/**
 * Words Home needs that are in neither the copy deck nor goldenCopy. None is locked: they are
 * reported to the lead for approval. Visible strings are kept to what the goldens and the data
 * contract force (a day label, a duration, an unreadable entry, a retry).
 */
export const homeLabels = {
  // INTERACTIONS_AND_STATES.md, Empty. It is not in copy.ts yet.
  emptyRecent: 'Your first echo will appear here.',
  yesterday: 'Yesterday',
  daysAgo: (days: number) => `${days} days ago`,
  minutes: (minutes: number) => `${minutes} min`,
  voiceEcho: 'Voice echo',
  unreadable: 'This echo can’t be opened',
  loadError: 'Your echoes couldn’t be loaded.',
  retry: 'Try again',
  // Spoken only.
  weekRhythm: 'This week’s rhythm',
  completed: 'completed',
  openEntry: 'Open',
  loading: 'Loading',
  localTime: 'Local time',
} as const;

const FAR_PAST_DAYS = 14;

/** "Today", "Yesterday", "3 days ago", then a short date. Counts calendar days, never 24 h blocks. */
export function dayLabel(localDay: string | undefined, today: string): string {
  if (!localDay) return copy.home.tabs[0];
  const days = dayDistance(localDay, today);
  if (days <= 0) return copy.home.tabs[0];
  if (days === 1) return homeLabels.yesterday;
  if (days <= FAR_PAST_DAYS) return homeLabels.daysAgo(days);
  const [year, month, date] = localDay.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export const minutesOf = (seconds: number) => Math.max(1, Math.round(seconds / 60));

export type EntryDisplay = {
  title: string;
  preview: string;
  /** false when the row failed to decrypt. It is shown, and cannot be opened. */
  openable: boolean;
  voiceOnly: boolean;
};

/** A voice-only entry has no title or preview, so it is shown by its kind rather than left blank. */
export function entryDisplay(entry: EntrySummary): EntryDisplay {
  if (!entry.readable) {
    return { title: homeLabels.unreadable, preview: '', openable: false, voiceOnly: false };
  }
  const title = entry.title || entry.preview;
  return {
    title: title || homeLabels.voiceEcho,
    preview: entry.title ? entry.preview : '',
    openable: true,
    voiceOnly: !title,
  };
}
