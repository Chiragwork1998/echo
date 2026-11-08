import { useEffect } from 'react';
import {
  type EasingFunction,
  type EasingFunctionFactory,
  ReduceMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';

/**
 * One value that waits `at` ms and then runs from 0 to 1 over `ms`, decelerating into place unless
 * it is given another curve. It begins when its component mounts, which is how an arrival is started
 * and how it is restarted. `initial` 1 draws the end at once, with nothing to wait for.
 */
export function useBeat(
  at: number,
  ms: number,
  initial: 0 | 1 = 0,
  easing: EasingFunction | EasingFunctionFactory = EASE,
): SharedValue<number> {
  const progress = useSharedValue<number>(initial);
  useEffect(() => {
    if (initial === 1) return;
    progress.set(
      withDelay(at, withTiming(1, { duration: ms, easing, reduceMotion: ReduceMotion.Never })),
    );
  }, [at, easing, initial, ms, progress]);
  return progress;
}
