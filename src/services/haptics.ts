import { Platform, Vibration } from 'react-native';

/**
 * Minimal haptic boundary. Uses the platform vibration API so selection and
 * completion feedback exist today; a dedicated haptics module can replace this
 * without touching screens.
 */

export const haptics = {
  /** Light selection impact, used by Arrival stones and completed saves. */
  light(): void {
    if (Platform.OS === 'web') {
      return;
    }
    Vibration.vibrate(Platform.OS === 'ios' ? 8 : 12);
  },
  /** Medium completion impact; used once when onboarding completes. */
  medium(): void {
    if (Platform.OS === 'web') {
      return;
    }
    Vibration.vibrate(Platform.OS === 'ios' ? 18 : 24);
  },
};
