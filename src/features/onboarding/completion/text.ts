import { copy } from '@/content/copy';
import { specCopy } from '@/content/specCopy';

/**
 * Words Completion needs that the copy deck does not hold: the reflection's loading and error lines
 * (the spec's own, in specCopy) and one line for a failed finish. The rest is working text, not
 * locked copy.
 */
export const completionText = {
  pending: specCopy.reflectionListening,
  error: specCopy.reflectionError,
  retry: 'Try again',
  continue: 'Continue',
  enterFailed: 'Your words are still saved. Try again in a moment.',
} as const;

/** Whole minutes written, never less than one. null when the length is unknown. */
export function minutesWritten(durationSeconds: number | null | undefined): number | null {
  if (!durationSeconds || durationSeconds <= 0) return null;
  return Math.max(1, Math.round(durationSeconds / 60));
}

/**
 * The deck's “Saved privately · 7 minutes” with the real time. The deck's own separator and words
 * are kept, so only the number and its singular change. Without a known length it says only that
 * the entry is saved, which is true of every entry.
 */
export function savedLine(durationSeconds: number | null | undefined): string {
  const minutes = minutesWritten(durationSeconds);
  if (minutes === null) return copy.completion.saved.split(' · ')[0] ?? copy.completion.saved;
  return copy.completion.saved.replace(
    /\d+ minutes/,
    `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
  );
}

/** Keeps the last two words together, so that a line is never left holding one word alone. */
export const bindLastWords = (text: string) => text.replace(/ (\S+)$/, '\u00A0$1');
