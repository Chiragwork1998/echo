import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

const SIZE = 22;
const STROKE = 2;
const SELECTED_DOT = 14;

// Choosing is a stone in water: the dot lands (small to whole over 320 ms, fading in over 200), the
// ring warms with it, and one hairline ring leaves it and widens until it is gone.
const DOT_FROM = 0.4;
const DOT_FADE_IN_MS = 200;
const DOT_FADE_OUT_MS = 180;
const RIPPLE_MS = 640;
const RIPPLE_TO = 1.9;
const RIPPLE_FROM_OPACITY = 0.55;

/**
 * The token-sized 22 pt ring, for list layouts such as the large-text fallback and You's Appearance.
 * Selection shows through shape as well as colour. It is decorative, so the parent control carries
 * the role. Markers drawn on scenery follow their golden and are private to that screen.
 *
 * The ring's colour is a cross-fade between a cream ring and a warm one, with the glow on the warm
 * one, so nothing about it changes in a single frame. A marker that is selected when it appears is
 * simply there: only a choice made while it is on screen plays. Reduce Motion: the dot and the ring
 * fade over 180 ms, with no growing and no ripple.
 */
export function ChoiceMarker({ selected, disabled }: { selected: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const warm = useSharedValue(selected ? 1 : 0);
  const land = useSharedValue(selected ? 1 : 0);
  const dotFade = useSharedValue(selected ? 1 : 0);
  const ripple = useSharedValue(1);
  const was = useRef(selected);

  useEffect(() => {
    if (was.current === selected) return;
    was.current = selected;
    const never = { reduceMotion: ReduceMotion.Never, easing: EASE };
    warm.set(
      withTiming(selected ? 1 : 0, {
        ...never,
        duration: reduced ? tokens.motion.fast : tokens.motion.standard,
      }),
    );
    if (selected) {
      if (!reduced) {
        land.set(0);
        land.set(withTiming(1, { ...never, duration: tokens.motion.standard }));
      }
      dotFade.set(
        withTiming(1, { ...never, duration: reduced ? tokens.motion.fast : DOT_FADE_IN_MS }),
      );
      if (!reduced) {
        ripple.set(0);
        ripple.set(withTiming(1, { ...never, duration: RIPPLE_MS }));
      }
    } else {
      dotFade.set(withTiming(0, { ...never, duration: DOT_FADE_OUT_MS }));
    }
  }, [dotFade, land, reduced, ripple, selected, warm]);

  const cream = useAnimatedStyle(() => ({ opacity: 1 - warm.get() }));
  const gold = useAnimatedStyle(() => ({ opacity: warm.get() }));
  const dot = useAnimatedStyle(() => ({
    opacity: dotFade.get(),
    transform: [{ scale: reduced ? 1 : DOT_FROM + (1 - DOT_FROM) * land.get() }],
  }));
  const leaving = useAnimatedStyle(() => {
    const p = ripple.get();
    return {
      opacity: RIPPLE_FROM_OPACITY * (1 - p),
      transform: [{ scale: 1 + (RIPPLE_TO - 1) * p }],
    };
  });

  return (
    <View
      style={[styles.box, { opacity: disabled ? 0.42 : 1 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        testID="marker-ring"
        pointerEvents="none"
        style={[styles.ring, { borderColor: colors.textPrimary }, cream]}
      />
      <Animated.View
        testID="marker-warm"
        pointerEvents="none"
        style={[
          styles.ring,
          { borderColor: colors.accentWarm, boxShadow: tokens.shadow.glow },
          gold,
        ]}
      />
      <Animated.View
        testID="marker-ripple"
        pointerEvents="none"
        style={[styles.ripple, { borderColor: colors.accentWarm }, leaving]}
      />
      <Animated.View
        testID="marker-dot"
        style={[styles.dot, { backgroundColor: colors.surfacePrimary }, dot]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { ...StyleSheet.absoluteFill, borderRadius: SIZE / 2, borderWidth: STROKE },
  ripple: { ...StyleSheet.absoluteFill, borderRadius: SIZE / 2, borderWidth: 1 },
  dot: { width: SELECTED_DOT, height: SELECTED_DOT, borderRadius: SELECTED_DOT / 2 },
});
