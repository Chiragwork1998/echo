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
 * The 22 pt ring used by Intent, Horizon and Voice. Selection shows through shape as well as
 * colour: a filled dot and a warm rim. It is decorative, so the parent control carries the role.
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
