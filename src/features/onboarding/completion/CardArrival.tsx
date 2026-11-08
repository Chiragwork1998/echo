import { useEffect, type ReactNode } from 'react';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { useReduceMotion } from '@/design/useReduceMotion';

/** Where the card comes from: it rises into the place it left, from just below. */
const RISE = 24;
const RISE_MS = 560;
const FADE_MS = 320;
/** The card waits for the screen to have begun to settle. */
const AFTER_MS = 120;
/**
 * The card also comes up from clear glass. If the blur flickers under a parent that is fading on a
 * device, set this to false: the rise stays, and the screen's own fade carries the opacity.
 */
export const CARD_FADE = true;

/**
 * The reflection card rising into its place as the book sinks out of it. It rests exactly where the
 * golden has it: the wrapper only moves it on the way. Reduce Motion: there is no rise, and the card's
 * content has its own short fade.
 */
export function CardArrival({ children }: { children: ReactNode }) {
  const reduced = useReduceMotion();
  const rise = useSharedValue(reduced ? 1 : 0);
  const shown = useSharedValue(reduced || !CARD_FADE ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      rise.set(1);
      shown.set(1);
      return;
    }
    const timing = (duration: number) => ({
      duration,
      easing: EASE,
      reduceMotion: ReduceMotion.Never,
    });
    rise.set(withDelay(AFTER_MS, withTiming(1, timing(RISE_MS))));
    if (CARD_FADE) shown.set(withDelay(AFTER_MS, withTiming(1, timing(FADE_MS))));
  }, [reduced, rise, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: RISE * (1 - rise.get()) }],
  }));
  return (
    <Animated.View testID="card-arrival" style={style}>
      {children}
    </Animated.View>
  );
}
