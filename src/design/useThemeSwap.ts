import { useEffect } from 'react';
import {
  ReduceMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EASE } from './ease';
import { useTheme } from './theme';
import { tokens } from './tokens';
import { useReduceMotion } from './useReduceMotion';

/**
 * 1 while a screen's composition and the theme agree, and 0 for the time between the person asking
 * for another theme and the composition changing over to it. A screen that draws two compositions
 * (Home's Night and Day) fades itself by this, so that it is never cut from one to the other in
 * front of a sky that is still the old theme. It goes out quickly, is gone when the composition
 * changes (the controls take the new theme when the plates are level), and comes back over the new
 * sky. Reduce Motion: 90 ms out, 90 ms in, 180 ms in all. Opacity only, on the UI thread.
 */
export function useThemeSwap(): SharedValue<number> {
  const { name, target } = useTheme();
  const reduced = useReduceMotion();
  const swap = useSharedValue(1);
  const changing = name !== target;
  useEffect(() => {
    swap.set(
      withTiming(changing ? 0 : 1, {
        duration: reduced
          ? tokens.motion.fast / 2
          : changing
            ? tokens.motion.fast
            : tokens.motion.standard,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [changing, reduced, swap]);
  return swap;
}
