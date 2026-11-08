import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { CARET, LIGHT, useSkyInk } from './sky';

const APPEAR_MS = 1100;
const CARET_BEAT_MS = 1050;
const LIGHT_BEAT_MS = 2300;
/** The light takes up its breath over this long, and lets it go over that. */
const BREATHE_IN_MS = 700;
const BREATHE_OUT_MS = 900;
/** The light glides to its new place (the words arrived, or were shown or hidden). */
const SLIDE_MS = 600;
/** How bright the resting light is. */
const REST = 0.34;
const HOUSE = Easing.bezier(0.22, 1, 0.36, 1);

type Props = {
  /** A soft caret waiting to be written with, or the small light that breathes while recording. */
  kind: 'caret' | 'light';
  /** False keeps it unseen. It comes up slowly when it turns true. */
  visible: boolean;
  /** The light only: recording is under way, so it brightens and breathes. */
  live?: boolean;
  /** Top left of the caret, or the centre of the light, in the writing area. */
  x: number;
  y: number;
};

/**
 * The only mark on the sky while it waits. With Reduce Motion it holds still instead of pulsing.
 * It never takes touches: the whole scene is the thing to tap.
 */
export function Beacon({ kind, visible, live = false, x, y }: Props) {
  const reduced = useReduceMotion();
  const { glow } = useSkyInk();
  const presence = useSharedValue(0);
  const beat = useSharedValue(0);
  // The light only: 0 is the resting light and 1 the breathing one. The light is the only mark on
  // the sky while someone speaks, so going from one to the other is a blend and never a step.
  const mix = useSharedValue(0);
  const slide = useSharedValue(y - LIGHT / 2);
  const caret = kind === 'caret';
  // The breath runs on while the light lets it go, so nothing drops from wherever it was.
  const [lingering, setLingering] = useState(live);
  if (live && !lingering) setLingering(true);
  useEffect(() => {
    if (live) return;
    const timer = setTimeout(() => setLingering(false), BREATHE_OUT_MS);
    return () => clearTimeout(timer);
  }, [live]);
  const pulsing = !reduced && (caret || live || lingering);

  useEffect(() => {
    presence.set(
      withTiming(visible ? 1 : 0, {
        duration: reduced ? 120 : APPEAR_MS,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [presence, reduced, visible]);

  useEffect(() => {
    if (caret) return;
    mix.set(
      withTiming(live ? 1 : 0, {
        duration: reduced ? tokens.motion.fast : live ? BREATHE_IN_MS : BREATHE_OUT_MS,
        easing: HOUSE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [caret, live, mix, reduced]);

  useEffect(() => {
    if (caret) return;
    slide.set(
      withTiming(y - LIGHT / 2, {
        duration: reduced ? 0 : SLIDE_MS,
        easing: HOUSE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [caret, reduced, slide, y]);

  useEffect(() => {
    if (!pulsing) {
      cancelAnimation(beat);
      beat.set(1);
      return;
    }
    const half = (caret ? CARET_BEAT_MS : LIGHT_BEAT_MS) / 2;
    const ease = Easing.inOut(Easing.sin);
    const options = { duration: half, easing: ease, reduceMotion: ReduceMotion.Never };
    beat.set(0);
    beat.set(withRepeat(withSequence(withTiming(1, options), withTiming(0, options)), -1));
    return () => cancelAnimation(beat);
  }, [beat, caret, pulsing]);

  const style = useAnimatedStyle(() => {
    const b = beat.get();
    // A caret dims almost to nothing between beats.
    if (caret) {
      return { opacity: presence.get() * (pulsing ? 0.12 + 0.88 * b : 0.85), transform: [] };
    }
    const m = mix.get();
    const breath = reduced ? 0.9 : 0.5 + 0.5 * b;
    return {
      opacity: presence.get() * (REST + (breath - REST) * m),
      transform: [
        { translateY: slide.get() },
        { scale: reduced ? 1 : 1 + (0.85 + 0.45 * b - 1) * m },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      testID="beacon"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        caret ? styles.caret : styles.light,
        {
          left: caret ? x : x - LIGHT / 2,
          top: caret ? y : 0,
          backgroundColor: glow,
          boxShadow: caret ? `0 0 10px 1px ${glow}` : `0 0 18px 4px ${glow}`,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  caret: { position: 'absolute', width: CARET.width, height: CARET.height, borderRadius: 1 },
  light: { position: 'absolute', width: LIGHT, height: LIGHT, borderRadius: LIGHT / 2 },
});
