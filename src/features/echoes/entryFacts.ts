import { copy } from '@/content/copy';
import { BECOME_PROMPT_ID } from '@/features/become/becomeCopy';
import type { EntrySummary } from '@/features/journal';
import type { Mood } from '@/state/onboarding';

import { echoesCopy } from './echoesCopy';

export const MOODS: readonly Mood[] = ['light', 'steady', 'unsettled', 'heavy', 'numb'];

/** The arrival label for a mood, from the copy deck, in the deck's order. */
export const moodLabel = (mood: Mood) => copy.arrival.moods[MOODS.indexOf(mood)] ?? mood;

export const minutesOf = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** 'YYYY-MM-DD' as a date on the wall clock, or null if it is not one. */
function dayOf(localDay: string | undefined): Date | null {
  const [year, month, day] = (localDay ?? '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

/** 'YYYY-MM-DD' as a short date in the device's language. The year appears when it is not this one. */
export function dateLabel(localDay: string | undefined, thisYear = new Date().getFullYear()) {
  const date = dayOf(localDay);
  if (!date) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === thisYear ? undefined : 'numeric',
  });
}

/** "Wednesday, 4 November", as the device writes it, with the year when it is not this one. */
export function longDate(localDay: string | undefined, thisYear = new Date().getFullYear()) {
  const date = dayOf(localDay);
  if (!date) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === thisYear ? undefined : 'numeric',
  });
}

/** The day of the month and the short weekday, for the margin of the archive: "5", "Thu". */
export function marginDate(localDay: string | undefined) {
  const date = dayOf(localDay);
  if (!date) return null;
  return {
    day: String(date.getDate()),
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
  };
}

/** "2026-11", so that echoes from one month gather under one heading. */
export const monthKey = (localDay: string | undefined) => (localDay ?? '').slice(0, 7);

/** "November", or "November 2025" when it is not this year. */
export function monthTitle(localDay: string | undefined, thisYear = new Date().getFullYear()) {
  const date = dayOf(localDay);
  if (!date) return '';
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: date.getFullYear() === thisYear ? undefined : 'numeric',
  });
}

/** A morning echo: the one that answers "Who will you be today?" (Become). */
export const isMorning = (entry: { promptId?: string }) => entry.promptId === BECOME_PROMPT_ID;

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

/**
 * What the archive says under an echo's first words. The date is already in the margin, so this is
 * the length and the mood, led by "Morning" for a morning echo. An unreadable row says nothing more.
 */
export function listMeta(
  entry: Pick<EntrySummary, 'readable' | 'durationSeconds' | 'moodBefore' | 'promptId'>,
): { morning: boolean; rest: string } {
  if (!entry.readable) return { morning: false, rest: '' };
  const rest = [echoesCopy.minutes(minutesOf(entry.durationSeconds))];
  if (entry.moodBefore) rest.push(echoesCopy.mood(moodLabel(entry.moodBefore)));
  return { morning: isMorning(entry), rest: rest.join(' · ') };
}

/** The first words of the body, unless the title was taken from them and already shows them. */
export function entryPreview(entry: Pick<EntrySummary, 'readable' | 'title' | 'preview'>): string {
  if (!entry.readable) return '';
  return entry.preview.startsWith(entry.title.replace(/…$/, '')) ? '' : entry.preview;
}

/**
 * An echo's own title, or its first words when it has none: never the question it answered, which
 * would repeat down the whole archive. A voice-only entry is named by its kind. Never blank.
 */
export function entryTitle(entry: Pick<EntrySummary, 'readable' | 'title' | 'preview'>): string {
  if (!entry.readable) return echoesCopy.unreadable;
  return entry.title || entry.preview || echoesCopy.voiceEcho;
}
