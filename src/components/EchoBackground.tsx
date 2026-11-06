import { Image } from 'expo-image';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { backgroundColours, backgroundSources } from '@/design/generated/backgrounds';
import { plateScale, plateStep, usePlateFlow } from '@/design/plateMotion';
import { useTheme } from '@/design/theme';
import { tokens, type ThemeName } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import type { ScreenId } from '@/features/onboarding/flow';

const GLIDE = Easing.inOut(Easing.cubic);

/** One plate, drawn with cover and centred. Plates are never tinted, overlaid or blended. */
function Plate({ screen, theme }: { screen: ScreenId; theme: ThemeName }) {
  return (
    <Image
      source={backgroundSources[theme][screen]}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      contentPosition="center"
      transition={0}
    />
  );
}

/**
 * The plate of the theme that has just been left, laid over the new one and fading away. It starts
 * fully opaque, so that the first frame of a change is still the old screen.
 */
function LeavingPlate({
  screen,
  theme,
  ms,
  onGone,
}: {
  screen: ScreenId;
  theme: ThemeName;
  ms: number;
  onGone: () => void;
}) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withTiming(0, { duration: ms, easing: GLIDE, reduceMotion: ReduceMotion.Never }));
    const gone = setTimeout(onGone, ms);
    return () => clearTimeout(gone);
  }, [ms, onGone, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Plate screen={screen} theme={theme} />
    </Animated.View>
  );
}

/**
 * The art-directed plate for a screen. Plates are fully graded: per their export contract they are
 * centred, drawn with cover, and never tinted, overlaid, or blended at runtime. Two things move it:
 *
 * - Onboarding. The plate scales as the journey goes forward and back (see plateMotion), so that the
 *   native cross-dissolve between screens carries a slow drift: the plate being left grows to 1.025
 *   as it fades, and the next one settles from 0.985. Reduce Motion drops the scale and keeps the
 *   fade.
 * - Theme. A change of theme cross-fades the two complete plates over 900 ms (180 ms with Reduce
 *   Motion). The plate is never blended with a colour: one image simply gives way to the other.
 *
 * `overlay` is drawn on the plate of the theme that is current, and beneath one that is leaving. It
 * is how Night Home comes alive (D-009): the loop lies over the still, so a Day plate fading out
 * above it still covers it, and the still beneath is the poster until the loop's first frame.
 */
export function EchoBackground({ screen, overlay }: { screen: ScreenId; overlay?: ReactNode }) {
  const { target } = useTheme();
  const reduced = useReduceMotion();

  const own = plateStep(screen);
  const flow = usePlateFlow((state) => state.step);
  const scaleTarget = reduced ? 1 : plateScale(own, flow);
  // Starts where the journey says it should be, so a plate that arrives is already at 0.985.
  const scale = useSharedValue(scaleTarget);
  useEffect(() => {
    scale.set(
      withTiming(scaleTarget, {
        duration: tokens.motion.screen,
        easing: GLIDE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [scale, scaleTarget]);
  const drift = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  // The theme this plate shows, and the one it has just left, which fades away over it.
  const [shown, setShown] = useState(target);
  const [leaving, setLeaving] = useState<{ theme: ThemeName; key: number } | null>(null);
  if (shown !== target) {
    setLeaving({ theme: shown, key: (leaving?.key ?? 0) + 1 });
    setShown(target);
  }
  const fadeMs = reduced ? tokens.motion.fast : tokens.motion.atmosphere;
  const settle = useCallback(() => setLeaving(null), []);

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: backgroundColours[target][screen] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Animated.View style={[StyleSheet.absoluteFill, drift]}>
        <Plate screen={screen} theme={target} />
        {overlay}
        {leaving && (
          <LeavingPlate
            key={leaving.key}
            screen={screen}
            theme={leaving.theme}
            ms={fadeMs}
            onGone={settle}
          />
        )}
      </Animated.View>
    </View>
  );
}
