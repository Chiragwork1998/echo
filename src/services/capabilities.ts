import {
  getRecordingPermissionsAsync as getMicrophonePermission,
  requestRecordingPermissionsAsync as requestMicrophonePermission,
} from 'expo-audio';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { initializeNotifications } from './notifications';

/**
 * Device capability boundary for permissions that must degrade gracefully
 * (`specs/PRODUCT_REQUIREMENTS.md` § Permissions). No permission is requested
 * until the user opts in, and denial is always non-blocking.
 *
 * Every adapter reports a real platform answer; when a module is missing or the
 * platform cannot support the capability it reports `unavailable` rather than
 * pretending a prompt happened.
 */

export type CapabilityStatus = 'granted' | 'denied' | 'not-determined' | 'unavailable';

export type BiometricKind = 'face' | 'fingerprint' | 'none';

export interface BiometricPort {
  kind(): Promise<BiometricKind>;
  /** Prompts only after the user enables the lock. */
  authenticate(reason: string): Promise<'success' | 'failed' | 'unavailable'>;
}

export interface NotificationPermissionPort {
  status(): Promise<CapabilityStatus>;
  request(): Promise<CapabilityStatus>;
}

export interface MicrophonePermissionPort {
  status(): Promise<CapabilityStatus>;
  request(): Promise<CapabilityStatus>;
}

export type EchoCapabilities = {
  biometrics: BiometricPort;
  microphone: MicrophonePermissionPort;
  notifications: NotificationPermissionPort;
};

type PermissionLike = {
  granted?: boolean;
  status?: string;
  canAskAgain?: boolean;
};

function toCapabilityStatus(response: PermissionLike | null | undefined): CapabilityStatus {
  if (!response) {
    return 'unavailable';
  }
  if (response.granted === true || response.status === 'granted') {
    return 'granted';
  }
  if (response.status === 'undetermined' || response.status === 'not-determined') {
    return 'not-determined';
  }
  if (response.canAskAgain === true) {
    return 'not-determined';
  }
  return response.status ? 'denied' : 'unavailable';
}

/** Copy for the Privacy toggle label; Face ID on iOS, biometrics elsewhere. */
export function biometricToggleLabel(): string {
  return Platform.OS === 'ios' ? 'Lock with Face ID' : 'Lock with biometrics';
}

export const deviceCapabilities: EchoCapabilities = {
  biometrics: {
    async kind() {
      try {
        const [hasHardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hasHardware || !enrolled) {
          return 'none';
        }
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (
          types.includes(
            LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
          )
        ) {
          return 'face';
        }
        return types.length > 0 ? 'fingerprint' : 'none';
      } catch {
        return 'none';
      }
    },
    async authenticate(reason: string) {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !enrolled) {
          return 'unavailable';
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: reason,
          cancelLabel: 'Cancel',
          disableDeviceFallback: false,
        });
        if (result.success) {
          return 'success';
        }
        return result.error === 'not_enrolled' || result.error === 'not_available'
          ? 'unavailable'
          : 'failed';
      } catch {
        return 'unavailable';
      }
    },
  },
  microphone: {
    async status() {
      try {
        return toCapabilityStatus(await getMicrophonePermission());
      } catch {
        return 'unavailable';
      }
    },
    async request() {
      try {
        return toCapabilityStatus(await requestMicrophonePermission());
      } catch {
        return 'unavailable';
      }
    },
  },
  notifications: {
    async status() {
      if (Platform.OS === 'web') {
        return 'unavailable';
      }
      try {
        return toCapabilityStatus(await Notifications.getPermissionsAsync());
      } catch {
        return 'unavailable';
      }
    },
    async request() {
      if (Platform.OS === 'web') {
        return 'unavailable';
      }
      try {
        const status = toCapabilityStatus(await Notifications.requestPermissionsAsync());
        if (status === 'granted') {
          await initializeNotifications();
        }
        return status;
      } catch {
        return 'unavailable';
      }
    },
  },
};
