import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { EchoText } from './EchoText';
import { GlassCard } from './GlassCard';
import { Icon } from './Icon';

const DISABLED_OPACITY = 0.42;
const PRESS_SCALE = 0.985;
const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton

type Props = {
  label: string;
  onPress?: () => void;
  /** cream is the filled default. glass is the outlined style on Landing and disabled Reflect. */
  variant?: 'cream' | 'glass';
  arrow?: boolean;
  disabled?: boolean;
  /** Explains what is needed to enable the button, for screen readers. */
  disabledHint?: string;
  loading?: boolean;
  /** Only for goldens that show a narrower button than the shared width, such as Landing. */
  width?: number;
  /** Landing's all-caps BEGIN is tracked wider than sentence-case labels. */
  tracking?: number;
};

export function PrimaryCTA({
  label,
  onPress,
  variant = 'cream',
  arrow = false,
  disabled = false,
  disabledHint,
  loading = false,
  width,
  tracking,
}: Props) {
  const { colors } = useTheme();
  const { ctaWidth } = useLayout();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const press = (to: number) => {
    scale.set(withTiming(to, { duration: tokens.motion.fast, reduceMotion: ReduceMotion.System }));
  };
  const blocked = disabled || loading;
  const labelColor = variant === 'cream' ? colors.textInk : colors.textPrimary;

  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <>
          <EchoText
            variant="button"
            style={[
              styles.label,
              { color: labelColor },
              tracking != null && { letterSpacing: tracking },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {label}
          </EchoText>
          {arrow && <Icon name="arrow-right" size={16} color={labelColor} />}
        </>
      )}
    </View>
  );

  return (
    <Animated.View
      style={[
        { width: width ?? ctaWidth, opacity: disabled ? DISABLED_OPACITY : 1, alignSelf: 'center' },
        animated,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: blocked, busy: loading }}
        accessibilityHint={disabled ? disabledHint : undefined}
        disabled={blocked}
        onPress={onPress}
        onPressIn={() => press(PRESS_SCALE)}
        onPressOut={() => press(1)}
      >
        {variant === 'cream' ? (
          <LinearGradient
            colors={CREAM_STOPS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.cream, !disabled && { boxShadow: tokens.shadow.button }]}
          >
            {content}
          </LinearGradient>
        ) : (
          <GlassCard radius={tokens.radius.button}>{content}</GlassCard>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Goldens set CTA labels near 13 pt, not the 16 pt token. See docs/SPEC_CONFLICTS.md, C-07.
  label: { fontSize: 13, lineHeight: 18 },
  cream: { borderRadius: tokens.radius.button },
  content: {
    height: tokens.size.primaryButtonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: tokens.space[24],
  },
});
