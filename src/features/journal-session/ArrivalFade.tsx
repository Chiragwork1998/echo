import { useEffect, useRef, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/design/useReduceMotion';

const FROM = 0.2;
const MS = 900;

type Props = {
  /** Counts the times spoken words have landed. Each new count lets the words in softly. */
  arrival: number;
  style: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  children: ReactNode;
};

/**
 * Lets words that were just spoken settle in, so they arrive rather than jump. It never touches
 * what the person types, only the moment a transcript lands. Reduce Motion: no animation at all.
 */
export function ArrivalFade({ arrival, style, pointerEvents = 'box-none', children }: Props) {
  const reduced = useReduceMotion();
  const opacity = useSharedValue(1);
  const seen = useRef(arrival);

  useEffect(() => {
    if (arrival === seen.current) return;
    seen.current = arrival;
    if (reduced) {
      opacity.set(1);
      return;
    }
    opacity.set(FROM);
    opacity.set(
      withTiming(1, {
        duration: MS,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [arrival, reduced, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, fade]}>
      {children}
    </Animated.View>
  );
}
