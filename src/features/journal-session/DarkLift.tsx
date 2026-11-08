import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

/** How long the dark takes to lift: slow enough to be a dawn, not a cut. */
const LIFT_MS = 700;

/**
 * Arrive leaves the screen almost black. This lifts that dark over the plate, so the book does not
 * meet a cut. `from` is how dark it was left, 0 to 1: a person who tapped early left it at 0 and
 * sees nothing at all. Opacity only; under Reduce Motion it is a plain fade of 180 ms.
 */
export function DarkLift({ from }: { from: number }) {
  const reduced = useReduceMotion();
  const dark = useSharedValue(from);
  const [gone, setGone] = useState(from <= 0);
  useEffect(() => {
    if (from <= 0) return;
    const ms = reduced ? tokens.motion.fast : LIFT_MS;
    dark.set(withTiming(0, { duration: ms, easing: EASE, reduceMotion: ReduceMotion.Never }));
    const timer = setTimeout(() => setGone(true), ms + 50);
    return () => clearTimeout(timer);
  }, [dark, from, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: dark.get() }));
  if (gone) return null;
  return (
    <Animated.View
      testID="arrive-lift"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.black, style]}
    />
  );
}

const styles = StyleSheet.create({ black: { backgroundColor: '#000000' } });
