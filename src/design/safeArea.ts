import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Reference frame insets for the handoff device (393 x 852).
 *
 * The golden plates are framed on a Dynamic Island iPhone: the status-bar
 * region above the wordmark measures 59 pt and the home-indicator region below
 * the CTA measures 34 pt. Using those two numbers as the preview floor means
 * the 393 x 852 web frame and a real device resolve the same composition.
 */
export const REFERENCE_INSETS = { top: 59, bottom: 34 } as const;

export type EchoInsets = { top: number; bottom: number };

export function useEchoInsets(): EchoInsets {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') {
    return {
      top: Math.max(insets.top, REFERENCE_INSETS.top),
      bottom: Math.max(insets.bottom, REFERENCE_INSETS.bottom),
    };
  }

  return { top: insets.top, bottom: insets.bottom };
}
