import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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
import { GlassBlur } from './GlassCard';

const ARROW_PATH = 'M4 12h16M14 6l6 6-6 6';
const DISABLED_OPACITY = 0.42;
const PRESS_SCALE = 0.985;
const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton

/** The goldens show a long arrow. The handoff's arrow-right icon is a chevron. */
function ArrowGlyph({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Path
        d={ARROW_PATH}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type Props = {
  label: string;
  onPress?: () => void;
  /** cream is the filled default. glass is the outlined style for disabled Reflect. */
  variant?: 'cream' | 'glass';
  arrow?: boolean;
  disabled?: boolean;
  /** Explains what is needed to enable the button, for screen readers. */
  disabledHint?: string;
  loading?: boolean;
};

export function PrimaryCTA({
  label,
  onPress,
  variant = 'cream',
  arrow = false,
  disabled = false,
  disabledHint,
  loading = false,
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
  const dimLabel = disabled && variant === 'glass';

  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <>
          <EchoText
            variant="label"
            style={[{ color: labelColor }, dimLabel && styles.dimLabel]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {label}
          </EchoText>
          {arrow && <ArrowGlyph color={labelColor} />}
        </>
      )}
    </View>
  );

  return (
    <Animated.View
      style={[
        {
          width: ctaWidth,
          // The goldens keep the frosted pill visible while disabled, and dim only its label.
          opacity: disabled && variant === 'cream' ? DISABLED_OPACITY : 1,
          alignSelf: 'center',
        },
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
          <View style={styles.frost}>
            <GlassBlur />
            <View style={[StyleSheet.absoluteFill, styles.frostFill]} />
            {content}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frost: {
    borderRadius: tokens.radius.button,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    overflow: 'hidden',
  },
  frostFill: { backgroundColor: 'rgba(246,241,232,0.2)' },
  dimLabel: { opacity: DISABLED_OPACITY },
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
