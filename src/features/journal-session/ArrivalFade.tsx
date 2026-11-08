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
  /**
   * The words are already readable, so new ones land plainly over them: the words the person was
   * reading do not dip to a fifth of themselves at the moment the transcript is swapped in.
   */
  filled?: boolean;
  children: ReactNode;
};

/**
 * Lets words that were just spoken settle in, so they arrive rather than jump. It never touches
 * what the person types, only the moment a transcript lands. Reduce Motion: no animation at all.
 */
export function ArrivalFade({
  arrival,
  style,
  pointerEvents = 'box-none',
  filled = false,
  children,
}: Props) {
  const reduced = useReduceMotion();
  const opacity = useSharedValue(1);
  const seen = useRef(arrival);
  // What `filled` was on the render before this one: the transcript has just landed in this render,
  // so it is the page as it was a moment ago that decides whether there was anything to dim.
  const was = useRef(filled);

  useEffect(() => {
    if (arrival === seen.current) return;
    seen.current = arrival;
    if (reduced || was.current) {
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
  // Declared after the effect above, so that effect still sees the previous render's value.
  useEffect(() => {
    was.current = filled;
  });

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, fade]}>
      {children}
    </Animated.View>
  );
}
