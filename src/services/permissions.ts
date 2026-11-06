import { Linking } from 'react-native';

import { loadAudio, loadNotifications } from './nativeModules';

export type PermissionState = {
  status: 'granted' | 'denied' | 'undetermined';
  /** false means the OS will not prompt again, so only Settings can change it. */
  canAskAgain: boolean;
};

type PermissionResponse = { status: string; canAskAgain?: boolean };

const UNKNOWN: PermissionState = { status: 'undetermined', canAskAgain: false };

function toState({ status, canAskAgain = true }: PermissionResponse): PermissionState {
  if (status === 'granted') return { status, canAskAgain };
  return { status: status === 'denied' ? 'denied' : 'undetermined', canAskAgain };
}

async function ask(load: () => Promise<PermissionResponse>): Promise<PermissionState> {
  try {
    return toState(await load());
  } catch {
    return UNKNOWN;
  }
}

// Each get* reads current state and never shows a prompt. Each request* shows the OS prompt, so call
// it only after the in-app explanation and never alongside another permission.

export const getMicrophonePermission = () => ask(() => loadAudio().getRecordingPermissionsAsync());

export const requestMicrophonePermission = () =>
  ask(() => loadAudio().requestRecordingPermissionsAsync());

export const getNotificationPermission = () => ask(() => loadNotifications().getPermissionsAsync());

export const requestNotificationPermission = () =>
  ask(() => loadNotifications().requestPermissionsAsync());

/** The Settings deep link. Show it only after a denial. */
export const openAppSettings = () => Linking.openSettings();
