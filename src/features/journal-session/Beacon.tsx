import { useEffect } from 'react';
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

import { useReduceMotion } from '@/design/useReduceMotion';

import { CARET, LIGHT, useSkyInk } from './sky';

const APPEAR_MS = 1100;
const CARET_BEAT_MS = 1050;
const LIGHT_BEAT_MS = 2300;

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
  const caret = kind === 'caret';
  const pulsing = !reduced && (caret || live);

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
    // A caret dims almost to nothing between beats. The light only ever softens.
    const floor = caret ? 0.12 : live ? 0.5 : 0.34;
    const level = pulsing ? floor + (1 - floor) * b : live ? 0.9 : caret ? 0.85 : floor;
    return {
      opacity: presence.get() * level,
      transform: caret ? [] : [{ scale: pulsing ? 0.85 + 0.45 * b : 1 }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        caret ? styles.caret : styles.light,
        {
          left: caret ? x : x - LIGHT / 2,
          top: caret ? y : y - LIGHT / 2,
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
