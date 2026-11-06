import { Platform } from 'react-native';

import { copy } from '@/content/copy';

import { loadNotifications } from './nativeModules';
import { getNotificationPermission } from './permissions';

/**
 * Fixed by requirement. It is a constant, and scheduleReminder takes no text, so that journal
 * content has no route into a notification.
 */
export const REMINDER_BODY = 'A small space is waiting for you.';

const REMINDER_ID = 'echo.daily-reminder';
const CHANNEL_ID = 'echo.reminders';
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ReminderResult =
  | { ok: true }
  /** The time is kept in useOnboarding. Show the Enable in Settings action. */
  | { ok: false; code: 'permission_required' }
  | { ok: false; code: 'invalid_time' }
  | { ok: false; code: 'failed' };

/**
 * Schedules the daily reminder for 'HH:MM' on the device's clock, replacing any previous one. A
 * daily trigger follows the wall clock, so it stays at the chosen time across timezones and DST. It
 * never prompts: request permission first, after Set my rhythm.
 */
export async function scheduleReminder(time: string): Promise<ReminderResult> {
  const match = TIME_PATTERN.exec(time);
  if (!match) return { ok: false, code: 'invalid_time' };
  const permission = await getNotificationPermission();
  if (permission.status !== 'granted') return { ok: false, code: 'permission_required' };

  try {
    const Notifications = loadNotifications();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: copy.rhythm.reminder,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: { title: copy.landing.wordmark, body: REMINDER_BODY, data: {} },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: Number(match[1]),
        minute: Number(match[2]),
        channelId: CHANNEL_ID,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, code: 'failed' };
  }
}

export async function cancelReminder(): Promise<ReminderResult> {
  try {
    await loadNotifications().cancelScheduledNotificationAsync(REMINDER_ID);
    return { ok: true };
  } catch {
    return { ok: false, code: 'failed' };
  }
}
