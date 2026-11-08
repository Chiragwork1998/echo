import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { clamp01, EASE } from '@/design/ease';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Measured from the golden: a thin ring around a solid dot.
const SIZE = 20;
export const RING = { radius: 9, stroke: 1.1 };
export const DOT_RADIUS = 3.9;
const CIRCUMFERENCE = 2 * Math.PI * RING.radius;
// The mark is made as the entry is held. From a start at M: the ring is drawn clockwise from twelve
// o'clock over 520 ms beginning 260 after M, then the dot lands over 320 beginning 680 after M.
const RING_FROM = 260;
const RING_MS = 520;
const DOT_FROM = 680;
const DOT_MS = 320;
/** The ring's stroke is not seen until this much of it is drawn, so a round cap never sits alone. */
const RING_SEEN = 0.05;
/** The dot is fully there by this share of its landing: 120 ms of 320. */
const DOT_SEEN = 0.375;
// Listening: the dot breathes, 1.2 s in and 1.2 s out, on a soft halo.
const BREATH = 1200;
const BREATH_REST = 1;
// How far the dot dims and shrinks at the bottom of its breath.
const DOT_BREATH = { opacity: 0.45, scale: 0.78 };
const HALO_GROW = 0.5;

/**
 * The ring when this much of it is drawn (0 to 1). The dash is drawn by its offset: the whole circle
 * is one dash, slid off the start of the path. Its stroke is not seen until some of it is drawn.
 */
export function ringStroke(drawn: number) {
  'worklet';
  return {
    strokeDashoffset: CIRCUMFERENCE * (1 - drawn),
    strokeOpacity: clamp01(drawn / RING_SEEN),
  };
}

type Props = {
  listening: boolean;
  /**
   * When the mark begins to be made, from mount, in ms. The screen has settled by then: a beat after
   * the screen's own fade, and later still where a plate is dissolving beneath it.
   */
  startAt?: number;
};

/**
 * The card's mark. Drawn as the entry is held: the ring is inked clockwise from the top, and the dot
 * lands inside it. Still once it is made. While a reflection is being waited for the dot breathes
 * instead. Reduce Motion: drawn at rest, at once.
 */
export function Seal({ listening, startAt = tokens.motion.standard }: Props) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const ring = useSharedValue(reduced ? 1 : 0);
  const dot = useSharedValue(reduced ? 1 : 0);
  const breath = useSharedValue(BREATH_REST);

  useEffect(() => {
    if (reduced) {
      ring.set(1);
      dot.set(1);
      return;
    }
    ring.set(
      withDelay(
        startAt + RING_FROM,
        withTiming(1, { duration: RING_MS, easing: EASE, reduceMotion: ReduceMotion.Never }),
      ),
    );
    dot.set(
      withDelay(
        startAt + DOT_FROM,
        withTiming(1, {
          duration: DOT_MS,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.Never,
        }),
      ),
    );
  }, [dot, reduced, ring, startAt]);

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

  const ringProps = useAnimatedProps(() => ringStroke(ring.get()));
  const dotStyle = useAnimatedStyle(() => {
    const landed = dot.get();
    const b = breath.get();
    return {
      opacity: clamp01(landed / DOT_SEEN) * (DOT_BREATH.opacity + (1 - DOT_BREATH.opacity) * b),
      // Never exactly nothing: a transform of zero cannot be inverted on every platform.
      transform: [
        { scale: Math.max(landed, 0.001) * (DOT_BREATH.scale + (1 - DOT_BREATH.scale) * b) },
      ],
    };
  });
  const halo = useAnimatedStyle(() => ({
    opacity: listening ? breath.get() * dot.get() : 0,
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
      <View style={styles.layer}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <AnimatedCircle
            testID="seal-ring"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RING.radius}
            stroke={colors.textPrimary}
            strokeWidth={RING.stroke}
            fill="none"
            strokeDasharray={[CIRCUMFERENCE, CIRCUMFERENCE]}
            // Twelve o'clock, clockwise. A fixed turn of the drawing, never animated.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            animatedProps={ringProps}
          />
        </Svg>
      </View>
      <Animated.View testID="seal-dot" style={[styles.layer, dotStyle]}>
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
