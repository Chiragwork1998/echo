import { Alert } from 'react-native';

import {
  getNotificationPermission,
  openAppSettings,
  requestNotificationPermission,
} from '@/services/permissions';
import { cancelReminder, scheduleReminder } from '@/services/reminders';

// Not in the copy deck. The explanation is the handoff's suggested usage string (SHIPPING.md).
const EXPLANATION = 'ECHO can gently remind you at the time you choose.';
const TITLE = 'Gentle reminder';

const ask = (body: string, confirm: string) =>
  new Promise<boolean>((resolve) => {
    Alert.alert(TITLE, body, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: confirm, onPress: () => resolve(true) },
    ]);
  });

/** What commitReminder did, so that the screen that asked can answer in its own way. */
export type ReminderCommit =
  /** The daily reminder is set for `time`, written 'HH:MM'. */
  | { status: 'scheduled'; time: string }
  /** The reminder is off, and any earlier one is cancelled. */
  | { status: 'off' }
  /** The phone will not deliver notifications: the person said not now, or the OS says no. */
  | { status: 'not_allowed' }
  /** Allowed, but the phone would not schedule it. */
  | { status: 'failed' };

/**
 * Applies the chosen reminder. Never blocks the journey: the time stays saved whatever happens, and
 * the permission is asked for only here, after Set my rhythm, with an explanation first. The
 * Settings link appears only after a denial. Says what came of it, and never throws.
 */
export async function commitReminder(time: string, enabled: boolean): Promise<ReminderCommit> {
  if (!enabled) {
    await cancelReminder();
    return { status: 'off' };
  }
  let permission = await getNotificationPermission();
  if (permission.status === 'undetermined' && (await ask(EXPLANATION, 'Allow'))) {
    permission = await requestNotificationPermission();
    if (permission.status === 'denied' && (await ask(EXPLANATION, 'Enable in Settings'))) {
      await openAppSettings();
    }
  }
  if (permission.status !== 'granted') return { status: 'not_allowed' };
  const scheduled = await scheduleReminder(time);
  return scheduled.ok ? { status: 'scheduled', time } : { status: 'failed' };
}
