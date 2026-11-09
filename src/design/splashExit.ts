import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

import { tokens } from './tokens';

/**
 * How long the splash takes to go on Android, where it is a view that fades away over whatever the
 * app has drawn. Its default is 400 ms, and the view stays almost wholly opaque for the first part of
 * that. The walk (v10) saw the cost on a slow phone: the first frame the app draws is shown for a
 * single frame before the splash's view is laid over it, so Home flashed through the wordmark and
 * the wordmark then stood over Home for most of a third of a second (runs 1, 4 and 5, three launches in
 * five). Over a short fade that overlap is a few frames, and the app's own quickest motion is what
 * it takes. iOS keeps its own: its options are another matter and nothing was seen there.
 */
export function configureSplashExit(os: string = Platform.OS): void {
  if (os !== 'android') return;
  try {
    SplashScreen.setOptions({ duration: tokens.motion.fast });
  } catch {
    // A build without the native function keeps the default fade, which is only slower.
  }
}
