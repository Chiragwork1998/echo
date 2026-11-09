import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PLATE_HELD_OPACITY } from '@/design/platePaint';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { useScreenReader } from '@/features/journal-session/useScreenReader';

/**
 * Completion after a daily session comes in by a fade of its own, over the session's book as it sinks. The
 * stack's fade was not seen on the walked emulator: a screen appeared within a frame or two, and Completion's
 * plate (the copy of the photograph it holds up until its own has been drawn) cut the book away before its
 * sink was drawn (walk v11, after Not now). It starts at a hair above nothing, so that it is drawn, and its
 * photograph put on the GPU, from its first frame (see PLATE_HELD_OPACITY). Reduce Motion and a screen
 * reader: the house's short fade, as the stack's own was.
 */
export function CompletionArrival({ children }: { children: ReactNode }) {
  const reduced = useReduceMotion();
  const screenReader = useScreenReader();
  const shown = useSharedValue(PLATE_HELD_OPACITY);
  const duration = reduced || screenReader ? tokens.motion.fast : tokens.motion.standard;
  useEffect(() => {
    shown.set(
      withTiming(1, {
        duration,
        easing: Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [duration, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View testID="completion-arrival" style={[styles.fill, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
