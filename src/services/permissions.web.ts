import type { PermissionState } from './permissions';

export type { PermissionState } from './permissions';

const unavailable = async (): Promise<PermissionState> => ({
  status: 'denied',
  canAskAgain: false,
});

export const getMicrophonePermission = unavailable;
export const requestMicrophonePermission = unavailable;
export const getNotificationPermission = unavailable;
export const requestNotificationPermission = unavailable;
export const openAppSettings = async () => undefined;
