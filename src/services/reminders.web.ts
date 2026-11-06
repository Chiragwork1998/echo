import type { ReminderResult } from './reminders';

export type { ReminderResult } from './reminders';

export const REMINDER_BODY = 'A small space is waiting for you.';

export const scheduleReminder = async (): Promise<ReminderResult> => ({
  ok: false,
  code: 'failed',
});

export const cancelReminder = async (): Promise<ReminderResult> => ({ ok: true });
