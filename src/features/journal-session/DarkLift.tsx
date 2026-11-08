import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { useUiBegun, watchAnimation } from '@/features/book/animationEnd';

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
  const begun = useUiBegun();
  useEffect(() => {
    if (from <= 0) return;
    const ms = reduced ? tokens.motion.fast : LIFT_MS;
    // The dark is taken away when its own lift has ended, and not when a clock says it should have: the
    // UI thread of a slow phone begins the lift seconds after it is asked, and the dark would be taken
    // away in the middle of it, which is the cut that the lift is there to prevent.
    const watch = watchAnimation(ms, () => setGone(true));
    const { ended } = watch;
    const lifted = () => {
      'worklet';
      runOnJS(ended)();
    };
    dark.set(
      withTiming(0, { duration: ms, easing: EASE, reduceMotion: ReduceMotion.Never }, lifted),
    );
    begun(watch.began);
    return () => watch.cancel();
  }, [begun, dark, from, reduced]);
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
