import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { parseColor } from '@/design/mixColor';
import { useTheme } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';

/** The length of the light as a share of the line it travels along. */
const SEGMENT = 0.28;
const TRAVEL_MS = 1400;
const REST_MS = 300;
/** At its brightest the light is still dim: a hairline that waits, never a bar that fills. */
const PEAK = 0.85;
/** Under Reduce Motion the light holds still: wider, and dimmer. */
const STILL_SHARE = 0.55;
const STILL_OPACITY = 0.7;

/** `colour` at `alpha`, whatever form it is in (the theme's colours are rgba() mid-crossfade). */
function withAlpha(colour: string, alpha: number): string {
  const rgb = parseColor(colour);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : colour;
}

/**
 * Waiting, said quietly: a 1 pt hairline of warm light that travels along the bottom edge of the
 * control that is working (a row's own rule, or the lower inner edge of a pill, which clips it to its
 * curve), instead of a spinner. It is decorative: the control carries `busy` and says the work in
 * words. It lets every touch through, and under Reduce Motion it does not move at all.
 *
 * Place it as the last child of a view that clips (or whose bottom edge is the rule), `inset` in from
 * either side if the rule is.
 */
export function TideLine({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(sweep);
      sweep.set(0);
      return;
    }
    sweep.set(
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: TRAVEL_MS,
            easing: Easing.inOut(Easing.cubic),
            reduceMotion: ReduceMotion.Never,
          }),
          withDelay(REST_MS, withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(sweep);
  }, [reduced, sweep]);

  const length = width * (reduced ? STILL_SHARE : SEGMENT);
  const light = useAnimatedStyle(() => ({
    // From just outside the left end to just outside the right, so it enters and leaves unseen.
    transform: [
      { translateX: reduced ? (width - length) / 2 : -length + sweep.get() * (width + length) },
    ],
  }));

  const warm = colors.accentWarm;
  return (
    <View
      testID="tide-line"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { left: inset, right: inset }]}
    >
      {width > 0 ? (
        <Animated.View
          style={[styles.light, { width: length, opacity: reduced ? STILL_OPACITY : 1 }, light]}
        >
          <LinearGradient
            colors={[withAlpha(warm, 0), withAlpha(warm, PEAK), withAlpha(warm, 0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', bottom: 0, height: 1, overflow: 'hidden' },
  light: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
