import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { sessionCopy } from './sessionCopy';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One turn of the moon through its phases: slow enough to read as the sky, never as a spinner. */
export const MOON_CYCLE_MS = 3600;
/** How long the moon takes to come and to go. */
const MOON_FADE_MS = 420;
const SIZE = 24;
const RADIUS = 9;
const CENTRE = SIZE / 2;

/**
 * The lit part of a moon at `phase` (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter), as an SVG path
 * about (cx, cy). The limb is the half circle on the lit side; the terminator is half an ellipse whose width
 * follows the cosine of the phase, bowing toward the dark side for a crescent and the lit side when gibbous.
 */
export function moonPath(phase: number, cx: number, cy: number, r: number): string {
  'worklet';
  const p = phase - Math.floor(phase);
  const waxing = p < 0.5;
  const k = Math.cos(2 * Math.PI * p);
  // Three places is a hundredth of a point at most: no exponent, and the same path for the same phase.
  const rx = Math.round(Math.abs(k) * r * 1000) / 1000;
  const top = `${cx} ${cy - r}`;
  const bottom = `${cx} ${cy + r}`;
  const limb = waxing ? 1 : 0;
  const terminator = waxing ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0;
  return `M ${top} A ${r} ${r} 0 0 ${limb} ${bottom} A ${rx} ${r} 0 0 ${terminator} ${top} Z`;
}

/**
 * Words are on their way (D-016, D-017): a small moon over the page, turning through its phases while a
 * take becomes words, gone once they land. The owner asked for it on 2026-11-09: "like a moon which is
 * changing shape ... something fairly aesthetic". It is the sky's own sign, in the warm accent, with the
 * dark of the moon faintly there, so a new moon is still a moon. Under Reduce Motion it rests at half and
 * only comes and goes.
 */
export function TranscribingMoon({ visible, top }: { visible: boolean; top: number }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const phase = useSharedValue(reduced ? 0.25 : 0.12);
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: reduced ? tokens.motion.fast : MOON_FADE_MS,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [reduced, shown, visible]);

  useEffect(() => {
    if (!visible || reduced) return;
    // From a thin crescent, round and round for as long as the words take.
    phase.set(0.12);
    phase.set(
      withRepeat(
        withTiming(1.12, {
          duration: MOON_CYCLE_MS,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.Never,
        }),
        -1,
      ),
    );
    return () => cancelAnimation(phase);
  }, [phase, reduced, visible]);

  const lit = useAnimatedProps(() => ({ d: moonPath(phase.get(), CENTRE, CENTRE, RADIUS) }));
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));

  return (
    <Animated.View
      testID="transcribing-moon"
      pointerEvents="none"
      accessible={visible}
      accessibilityLabel={sessionCopy.transcribe.listening}
      accessibilityLiveRegion={visible ? 'polite' : 'none'}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
      style={[styles.place, { top }, fade]}
    >
      <View style={styles.glow}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill={colors.accentWarm} opacity={0.16} />
          <AnimatedPath animatedProps={lit} fill={colors.accentWarm} />
        </Svg>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  place: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  glow: {
    shadowColor: '#F3D9A4',
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
