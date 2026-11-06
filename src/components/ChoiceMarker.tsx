import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

const SIZE = 22;
const STROKE = 2;
const SELECTED_DOT = 14;

/**
 * The token-sized 22 pt ring, for list layouts such as the large-text fallback. Selection shows
 * through shape as well as colour. It is decorative, so the parent control carries the role.
 * Markers drawn on scenery follow their golden and are private to that screen.
 */
export function ChoiceMarker({ selected, disabled }: { selected: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.set(
      withSpring(selected ? 1 : 0, { ...tokens.motion.spring, reduceMotion: ReduceMotion.System }),
    );
  }, [selected, progress]);

  const dot = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: 0.96 + 0.04 * progress.get() }],
  }));

  return (
    <View
      style={[
        styles.ring,
        {
          borderColor: selected ? colors.accentWarm : colors.textPrimary,
          boxShadow: selected ? tokens.shadow.glow : undefined,
          opacity: disabled ? 0.42 : 1,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.dot, { backgroundColor: colors.surfacePrimary }, dot]} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: STROKE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: SELECTED_DOT, height: SELECTED_DOT, borderRadius: SELECTED_DOT / 2 },
});
