import { Platform } from 'react-native';

import { copy } from '@/content/copy';
import { loadNotifications } from '@/services/nativeModules';
import { getNotificationPermission } from '@/services/permissions';

/**
 * Fixed by requirement (docs/PRODUCT_V1.md, ECHO Plus). A constant, and the scheduler takes no text,
 * so nothing a person wrote has a route into it.
 */
export const TRIAL_REMINDER_BODY = 'Your ECHO Plus trial ends in 2 days.';

export const TRIAL_REMINDER_ID = 'echo.plus-trial-ends';
const CHANNEL_ID = 'echo.plus';
const CHANNEL_NAME = 'ECHO Plus';
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export type TrialState = {
  status: 'unknown' | 'free' | 'plus';
  trial: boolean;
  expiresAt: number | null;
  willRenew: boolean;
};

export type TrialReminderResult =
  | 'scheduled'
  /** Already scheduled for that moment: nothing to do. */
  | 'unchanged'
  | 'cancelled'
  /** A trial that will charge, but notifications are not allowed. ECHO never asks for this. */
  | 'not_allowed'
  | 'failed';

/** When to remind, or null for no reminder: a trial that will turn into a charge, two days out. */
export function reminderAt(state: TrialState, now: number): number | null {
  if (state.status !== 'plus' || !state.trial || !state.willRenew || state.expiresAt === null) {
    return null;
  }
  const at = state.expiresAt - TWO_DAYS_MS;
  // Less than two days are left, so "ends in 2 days" would no longer be true.
  return at > now ? at : null;
}

let scheduledFor: number | null = null;

/**
 * Keeps the one trial reminder in step with the trial. In a trial that will turn into a charge, with
 * notifications already allowed, it is scheduled for two days before the trial ends. A trial that
 * has ended, become a paid subscription, or been cancelled takes it away. It never asks for
 * permission, and never fails loudly: a missed reminder must not disturb anything else.
 */
export async function syncTrialReminder(
  state: TrialState,
  now: number = Date.now(),
): Promise<TrialReminderResult> {
  const at = reminderAt(state, now);
  try {
    const Notifications = loadNotifications();
    if (at === null) {
      if (state.status === 'unknown') return 'unchanged';
      scheduledFor = null;
      await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
      return 'cancelled';
    }
    if (at === scheduledFor) return 'unchanged';
    const permission = await getNotificationPermission();
    if (permission.status !== 'granted') return 'not_allowed';
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: CHANNEL_NAME,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: TRIAL_REMINDER_ID,
      content: { title: copy.landing.wordmark, body: TRIAL_REMINDER_BODY, data: {} },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(at),
        channelId: CHANNEL_ID,
      },
    });
    scheduledFor = at;
    return 'scheduled';
  } catch {
    return 'failed';
  }
}

/** Tests only. */
export function forgetTrialReminder(): void {
  scheduledFor = null;
}
