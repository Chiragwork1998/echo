import { showToast } from '@/components/Toast';
import { specCopy } from '@/content/specCopy';

import type { ReminderCommit } from './commitReminder';
import { clockText, parseTime } from './time';
import { readClockFormat } from './useClock';

/**
 * The line for a reminder that was scheduled: “We’ll meet you at 9:30 PM.”, with the time in the
 * device's own format. Null for everything else, which says nothing: a failure is shown by the
 * screen's own notice, and turning a reminder off needs no confirmation.
 */
export function reminderConfirmation(commit: ReminderCommit | undefined): string | null {
  if (commit?.status !== 'scheduled') return null;
  const minutes = parseTime(commit.time);
  if (minutes === undefined) return null;
  const { locale, hour12 } = readClockFormat();
  return specCopy.reminderScheduled(clockText(minutes, { locale, hour12 }).spoken);
}

/** Shows the toast for a reminder that was scheduled, and does nothing for any other outcome. */
export function announceReminder(commit: ReminderCommit | undefined): void {
  const message = reminderConfirmation(commit);
  if (message) showToast(message);
}
