import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { cue } from '@/design/haptics';
import { parseColor } from '@/design/mixColor';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

// Measured from the Privacy goldens, which differ from the token sizes (docs/SPEC_CONFLICTS.md, C-13).
export const TRACK = { width: 44, height: 25 };
export const KNOB = 24;
/** The knob's left edge at rest: the 1 pt ring and half a point of air. Off, then on (19.5). */
export const KNOB_OFF_X = 1.5;
export const TRAVEL = 18;
export const KNOB_ON_X = KNOB_OFF_X + TRAVEL;
/** The knob's top edge, the same off and on: it is centred on the 25 pt track, 24 pt tall. */
const KNOB_TOP = (TRACK.height - KNOB) / 2;
const KNOB_COLOUR = '#FDFCFC';
/** accentWarm at 70 percent: the golden's "B3". */
export const TRACK_ON_ALPHA = 0.7;
const RING = 1;

// The warmth spreads from the knob like light through water: a circle wide enough to cover the whole
// track from the knob's centre, growing from a fifth of its size as the knob travels.
const WASH = 66;
const WASH_FROM = 0.2;
/** It is fully there a quarter of the way through, so the colour leads the knob. */
const WASH_LEAD = 4;
const HALO = 36;
const HALO_FROM = 0.7;
/** The knob crosses the middle of the track this long after the press. */
export const CUE_AFTER_MS = 45;
const HALO_IN_MS = 120;

/** accentWarm at an alpha, whatever form the theme holds it in (mid-crossfade it is an rgba()). */
export function warm(colour: string, alpha: number): string {
  const rgb = parseColor(colour);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : colour;
}

type Props = {
  value: boolean;
  /** Held down right now: a soft warmth gathers behind the knob. */
  pressed?: boolean;
};

/**
 * The golden's switch, in its own body: 44 by 25, a 24 pt knob, a 1 pt ring when off and a warm fill
 * when on. Nothing about its geometry changes between the two: the ring is a layer that fades, the
 * fill is light that spreads from the knob, and the knob only translates, 320 ms on the shared
 * decelerating ease. Decorative: the row that holds it carries the role and the state.
 *
 * Reduce Motion: opacity only. The knob is at its new rest at once while the fill and the ring
 * cross-fade in 180 ms, and there is no halo.
 */
export function SwitchTrack({ value, pressed = false }: Props) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const on = useSharedValue(value ? 1 : 0);
  const halo = useSharedValue(0);
  const target = value ? 1 : 0;

  useEffect(() => {
    on.set(
      withTiming(target, {
        duration: reduced ? tokens.motion.fast : tokens.motion.standard,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [on, reduced, target]);

  useEffect(() => {
    if (reduced) {
      halo.set(0);
      return;
    }
    halo.set(
      pressed
        ? withTiming(1, { duration: HALO_IN_MS, easing: EASE, reduceMotion: ReduceMotion.Never })
        : withTiming(0, {
            duration: tokens.motion.standard,
            easing: EASE,
            reduceMotion: ReduceMotion.Never,
          }),
    );
  }, [halo, pressed, reduced]);

  // The click is felt as the knob crosses the middle. Not on mount, and cleared if it unmounts first.
  const settled = useRef(value);
  useEffect(() => {
    if (settled.current === value) return;
    settled.current = value;
    const timer = setTimeout(() => cue(value ? 'on' : 'off'), CUE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [value]);

  // Where the knob is, as 0 to 1. Reduce Motion places it at once and lets the colours fade.
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: KNOB_OFF_X + TRAVEL * (reduced ? target : on.get()) }],
  }));
  const ring = useAnimatedStyle(() => ({ opacity: 1 - on.get() }));
  const wash = useAnimatedStyle(() => {
    const p = on.get();
    const at = reduced ? target : p;
    return {
      opacity: reduced ? p : Math.min(1, WASH_LEAD * p),
      transform: [
        { translateX: TRAVEL * at },
        { scale: reduced ? 1 : WASH_FROM + (1 - WASH_FROM) * p },
      ],
    };
  });
  const gather = useAnimatedStyle(() => {
    const p = halo.get();
    return {
      opacity: p,
      transform: [
        { translateX: TRAVEL * (reduced ? target : on.get()) },
        { scale: HALO_FROM + (1 - HALO_FROM) * p },
      ],
    };
  });

  return (
    <View testID="switch-track" style={styles.track}>
      <Animated.View
        testID="switch-ring"
        pointerEvents="none"
        style={[styles.ring, { borderColor: colors.borderGlass }, ring]}
      />
      <Animated.View
        testID="switch-fill"
        pointerEvents="none"
        style={[styles.wash, { backgroundColor: warm(colors.accentWarm, TRACK_ON_ALPHA) }, wash]}
      />
      <Animated.View
        testID="switch-halo"
        pointerEvents="none"
        style={[styles.halo, { backgroundColor: warm(colors.accentWarm, 0.34) }, gather]}
      />
      <Animated.View testID="switch-knob" style={[styles.knob, knob]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK.width,
    height: TRACK.height,
    borderRadius: TRACK.height / 2,
    overflow: 'hidden',
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: TRACK.height / 2,
    borderWidth: RING,
  },
  // 66 pt across, centred on the knob's centre when the knob is off (13.5 across, 12.5 down).
  wash: {
    position: 'absolute',
    width: WASH,
    height: WASH,
    borderRadius: WASH / 2,
    left: KNOB_OFF_X + KNOB / 2 - WASH / 2,
    top: TRACK.height / 2 - WASH / 2,
  },
  halo: {
    position: 'absolute',
    width: HALO,
    height: HALO,
    borderRadius: HALO / 2,
    left: KNOB_OFF_X + KNOB / 2 - HALO / 2,
    top: TRACK.height / 2 - HALO / 2,
  },
  knob: {
    position: 'absolute',
    left: 0,
    top: KNOB_TOP,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: KNOB_COLOUR,
  },
});
