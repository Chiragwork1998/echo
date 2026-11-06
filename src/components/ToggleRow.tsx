import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { EchoText } from './EchoText';
import { GlassCard } from './GlassCard';

const MIN_HEIGHT = 60;
const { toggleWidth: TRACK_W, toggleHeight: TRACK_H } = tokens.size;
const KNOB = TRACK_H - 6;
const TRAVEL = TRACK_W - KNOB - 6;

type Props = {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Read by screen readers, for example why the option is unavailable. */
  hint?: string;
  icon?: ReactNode;
};

export function ToggleRow({ label, value, onChange, disabled = false, hint, icon }: Props) {
  const { colors } = useTheme();
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.set(
      withSpring(value ? 1 : 0, { ...tokens.motion.spring, reduceMotion: ReduceMotion.System }),
    );
  }, [value, on]);

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: on.get() * TRAVEL }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{ opacity: disabled ? 0.42 : 1 }}
    >
      <GlassCard radius={tokens.radius.medium} contentStyle={styles.content}>
        {icon}
        <EchoText variant="bodyM" style={styles.label}>
          {label}
        </EchoText>
        <View
          style={[
            styles.track,
            {
              backgroundColor: value ? colors.accentWarm : 'transparent',
              borderColor: colors.borderGlass,
            },
          ]}
        >
          <Animated.View style={[styles.knob, { backgroundColor: colors.surfacePrimary }, knob]} />
        </View>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    minHeight: MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
    paddingHorizontal: tokens.space[16],
  },
  label: { flex: 1 },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: 1,
    padding: 2,
    justifyContent: 'center',
  },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
});
