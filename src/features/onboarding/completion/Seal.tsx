import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

// Measured from the golden: a thin ring around a solid dot.
const SIZE = 20;
const RING = { radius: 9, stroke: 1.1 };
const DOT_RADIUS = 3.9;
// The check: the ring and dot arrive over 180 ms, a beat after the screen has settled.
const ARRIVE_DELAY = tokens.motion.standard;
// Listening: the dot breathes, 1.2 s in and 1.2 s out, on a soft halo.
const BREATH = 1200;
const BREATH_REST = 1;
const DOT_SCALE = { from: 0.35, low: 0.78 };
const HALO_GROW = 0.5;

type Props = { listening: boolean };

/**
 * The card's mark. Still once the entry is held. While a reflection is being waited for it breathes
 * instead. Reduce Motion keeps it still and only fades it in, with no scale.
 */
export function Seal({ listening }: Props) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const arrive = useSharedValue(0);
  const breath = useSharedValue(BREATH_REST);

  useEffect(() => {
    arrive.set(
      withDelay(
        ARRIVE_DELAY,
        withTiming(1, {
          duration: tokens.motion.fast,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        }),
      ),
    );
  }, [arrive]);

  useEffect(() => {
    if (!listening || reduced) {
      cancelAnimation(breath);
      breath.set(withTiming(BREATH_REST, { duration: tokens.motion.fast }));
      return;
    }
    const ease = { duration: BREATH, easing: Easing.inOut(Easing.sin) };
    breath.set(withRepeat(withSequence(withTiming(0, ease), withTiming(1, ease)), -1, false));
    return () => cancelAnimation(breath);
  }, [breath, listening, reduced]);

  const ring = useAnimatedStyle(() => ({
    opacity: arrive.get(),
    transform: reduced ? [] : [{ scale: interpolate(arrive.get(), [0, 1], [0.9, 1]) }],
  }));
  const dot = useAnimatedStyle(() => {
    const settle = reduced ? 1 : interpolate(arrive.get(), [0, 1], [DOT_SCALE.from, 1]);
    return {
      opacity: arrive.get() * interpolate(breath.get(), [0, 1], [0.45, 1]),
      transform: [{ scale: settle * interpolate(breath.get(), [0, 1], [DOT_SCALE.low, 1]) }],
    };
  });
  const halo = useAnimatedStyle(() => ({
    opacity: listening ? breath.get() : 0,
    transform: reduced ? [] : [{ scale: 1 + HALO_GROW * breath.get() }],
  }));

  return (
    <View
      style={styles.root}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Animated.View style={[styles.halo, { backgroundColor: colors.accentWarm }, halo]} />
      <Animated.View style={[styles.layer, ring]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RING.radius}
            stroke={colors.textPrimary}
            strokeWidth={RING.stroke}
            fill="none"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.layer, dot]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={DOT_RADIUS} fill={colors.textPrimary} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: SIZE, height: SIZE },
  layer: { ...StyleSheet.absoluteFill },
  // A warm disc the size of the dot, behind it. Only its glow shows.
  halo: {
    position: 'absolute',
    left: SIZE / 2 - DOT_RADIUS,
    top: SIZE / 2 - DOT_RADIUS,
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    boxShadow: tokens.shadow.glow,
  },
});
