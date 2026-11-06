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

/**
 * Applies the chosen reminder. Never blocks the journey: the time stays saved whatever happens, and
 * the permission is asked for only here, after Set my rhythm, with an explanation first. The
 * Settings link appears only after a denial.
 */
export async function commitReminder(time: string, enabled: boolean): Promise<void> {
  if (!enabled) {
    await cancelReminder();
    return;
  }
  let permission = await getNotificationPermission();
  if (permission.status === 'undetermined' && (await ask(EXPLANATION, 'Allow'))) {
    permission = await requestNotificationPermission();
    if (permission.status === 'denied' && (await ask(EXPLANATION, 'Enable in Settings'))) {
      await openAppSettings();
    }
  }
  if (permission.status === 'granted') await scheduleReminder(time);
}
