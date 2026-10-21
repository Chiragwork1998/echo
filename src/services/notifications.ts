import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local gentle-reminder scheduling (`specs/SCREEN_SPECS.md` § 04 Rhythm).
 *
 * Only local notifications are used, and only after the user enables the
 * reminder. Notification copy is fixed product copy: it never contains journal
 * text, moods, prompts answered by the user, or reflection content.
 */

export const REMINDER_CHANNEL_ID = 'gentle-reminder';

/**
 * Fixed, journal-free notification copy. Recorded as an assumption in
 * `docs/NATIVE_CORE_IMPLEMENTATION.md` because the handoff locks screen copy
 * but does not specify notification body text.
 */
export const REMINDER_NOTIFICATION = {
  title: 'ECHO',
  body: 'Seven quiet minutes are waiting whenever you are.',
} as const;

export type ReminderScheduleResult =
  | { status: 'scheduled'; notificationId: string }
  | { status: 'unavailable' }
  | { status: 'invalid-time' };

export function parseLocalTime(localTime: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(localTime.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Gentle reminder',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Presents reminders while the app is foregrounded. Safe to call once. */
export function configureNotificationHandler(): void {
  if (Platform.OS === 'web') {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Registers the Android channel; harmless elsewhere. */
export async function initializeNotifications(): Promise<boolean> {
  configureNotificationHandler();
  try {
    await ensureAndroidChannel();
    return true;
  } catch {
    return false;
  }
}

/** Schedules the single repeating daily reminder, replacing any previous one. */
export async function scheduleDailyReminder(
  localTime: string,
): Promise<ReminderScheduleResult> {
  const time = parseLocalTime(localTime);
  if (!time) {
    return { status: 'invalid-time' };
  }
  if (Platform.OS === 'web') {
    return { status: 'unavailable' };
  }
  try {
    await cancelDailyReminder();
    await ensureAndroidChannel();
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: REMINDER_NOTIFICATION.title,
        body: REMINDER_NOTIFICATION.body,
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
        channelId: REMINDER_CHANNEL_ID,
      },
    });
    return { status: 'scheduled', notificationId };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Removes every reminder scheduled by ECHO for this device. */
export async function cancelDailyReminder(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter(
      (item) => item.content.title === REMINDER_NOTIFICATION.title,
    );
    await Promise.all(
      ours.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );
    return true;
  } catch {
    return false;
  }
}

export async function scheduledReminderCount(): Promise<number> {
  if (Platform.OS === 'web') {
    return 0;
  }
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.filter((item) => item.content.title === REMINDER_NOTIFICATION.title).length;
  } catch {
    return 0;
  }
}
