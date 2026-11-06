import { copy } from '@/content/copy';
import type { EntrySummary } from '@/features/journal';
import type { Mood } from '@/state/onboarding';

import { echoesCopy } from './echoesCopy';

export const MOODS: readonly Mood[] = ['light', 'steady', 'unsettled', 'heavy', 'numb'];

/** The arrival label for a mood, from the copy deck, in the deck's order. */
export const moodLabel = (mood: Mood) => copy.arrival.moods[MOODS.indexOf(mood)] ?? mood;

export const minutesOf = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** 'YYYY-MM-DD' as a short date in the device's language. The year appears when it is not this one. */
export function dateLabel(localDay: string | undefined, thisYear = new Date().getFullYear()) {
  const [year, month, day] = (localDay ?? '').split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: year === thisYear ? undefined : 'numeric',
  });
}

/** The date, how long it took, and the mood if one was chosen. An unreadable row has only a date. */
export function entryMeta(
  entry: Pick<EntrySummary, 'localDay' | 'durationSeconds' | 'moodBefore'> & {
    readable?: boolean;
  },
): string {
  const parts = [dateLabel(entry.localDay)];
  if (entry.readable !== false) {
    parts.push(echoesCopy.minutes(minutesOf(entry.durationSeconds)));
    if (entry.moodBefore) parts.push(echoesCopy.mood(moodLabel(entry.moodBefore)));
  }
  return parts.filter(Boolean).join(' · ');
}

/** The first words of the body, unless the title was taken from them and already shows them. */
export function entryPreview(entry: Pick<EntrySummary, 'readable' | 'title' | 'preview'>): string {
  if (!entry.readable) return '';
  return entry.preview.startsWith(entry.title.replace(/…$/, '')) ? '' : entry.preview;
}

/** A voice-only entry has no title or preview, so it is named by its kind. Never blank. */
export function entryTitle(entry: Pick<EntrySummary, 'readable' | 'title' | 'preview'>): string {
  if (!entry.readable) return echoesCopy.unreadable;
  return entry.title || entry.preview || echoesCopy.voiceEcho;
}
