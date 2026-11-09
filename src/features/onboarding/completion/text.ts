import { copy } from '@/content/copy';
import { specCopy } from '@/content/specCopy';
import { supportCopy } from '@/features/patterns/supportResources';

/**
 * Words Completion needs that the copy deck does not hold: the reflection's loading and error lines
 * (the spec's own, in specCopy) and one line for a failed finish. The rest is working text, not
 * locked copy: the card's actions and its line of support (D-017) wait for the owner's review, and
 * the support line is the support panel's own, PENDING its legal review (supportResources.ts).
 */
export const completionText = {
  pending: specCopy.reflectionListening,
  error: specCopy.reflectionError,
  retry: 'Try again',
  continue: 'Continue',
  enterFailed: 'Your words are still saved. Try again in a moment.',
  /** The saved card's one quiet action while there is no reading agreement. It opens the agreement. */
  hearItBack: 'Hear it back',
  /** In place of a reflection, when the entry suggests the person may be in danger. */
  support: supportCopy.title,
  talkToSomeone: 'Talk to someone',
  /** Opens the entry just kept, set out, in the card, and closes it again. */
  readItBack: 'Read it back',
  close: 'Close',
  /** Over the words while they are away being set out. */
  settingOut: 'Setting your words out in paragraphs…',
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
export const bindLastWords = (text: string) => text.replace(/ (\S+)$/, ' $1');
