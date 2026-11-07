// The web harness schedules nothing: there is no trial to remind anyone about, and no notifications.
import type { TrialReminderResult, TrialState } from './trialReminder';

export type { TrialReminderResult, TrialState } from './trialReminder';

export const TRIAL_REMINDER_BODY = 'Your ECHO Plus trial ends in 2 days.';
export const TRIAL_REMINDER_ID = 'echo.plus-trial-ends';

export const reminderAt = (): number | null => null;

export const syncTrialReminder = async (state: TrialState): Promise<TrialReminderResult> =>
  state.status === 'unknown' ? 'unchanged' : 'cancelled';

export const forgetTrialReminder = (): void => undefined;
