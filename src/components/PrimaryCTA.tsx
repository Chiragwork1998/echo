import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { EchoText } from './EchoText';
import { GlassBlur } from './GlassCard';
import { TideLine } from './TideLine';

const ARROW_PATH = 'M4 12h16M14 6l6 6-6 6';
const DISABLED_OPACITY = 0.42;
const PRESS_SCALE = 0.985;
// A tap is over in about 130 ms, so the press must be visibly under way in the first frames and
// finish early: decelerating, not in-out.
const PRESS_IN = Easing.out(Easing.cubic);
/** What the label does when the button is pressed with Reduce Motion on, or is working. */
const DIMMED_LABEL = 0.72;
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
  const reduced = useReduceMotion();
  const cream = variant === 'cream';
  // The cream pill is ghosted while it cannot be used, and fills in when it can: opacity and its
  // shadow both ease over 320 ms, so choosing something never makes the button pop.
  const enabled = useSharedValue(disabled ? 0 : 1);
  useEffect(() => {
    enabled.set(
      withTiming(disabled ? 0 : 1, {
        duration: reduced ? tokens.motion.fast : tokens.motion.standard,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [disabled, enabled, reduced]);
  const scale = useSharedValue(1);
  // Reduce Motion does not scale: the label dims for as long as the button is held.
  const held = useSharedValue(0);
  const working = useSharedValue(loading ? 1 : 0);
  useEffect(() => {
    working.set(
      withTiming(loading ? 1 : 0, {
        duration: tokens.motion.fast,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [loading, working]);

  const animated = useAnimatedStyle(() => ({
    opacity: cream ? DISABLED_OPACITY + (1 - DISABLED_OPACITY) * enabled.get() : 1,
    transform: [{ scale: scale.get() }],
  }));
  const shadow = useAnimatedStyle(() => ({ opacity: enabled.get() }));
  const caption = useAnimatedStyle(() => ({
    opacity: 1 - (1 - DIMMED_LABEL) * Math.max(held.get(), working.get()),
  }));
  const press = (down: boolean) => {
    if (reduced) {
      held.set(
        withTiming(down ? 1 : 0, {
          duration: tokens.motion.instant,
          reduceMotion: ReduceMotion.Never,
        }),
      );
      return;
    }
    scale.set(
      withTiming(down ? PRESS_SCALE : 1, {
        duration: tokens.motion.fast,
        easing: down ? PRESS_IN : EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  };
  const blocked = disabled || loading;
  const labelColor = cream ? colors.textInk : colors.textPrimary;
  const dimLabel = disabled && !cream;

  // The label stays while it works, and says so by dimming; the tide line runs beneath it.
  const content = (
    <Animated.View testID="cta-label" style={[styles.content, caption]}>
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
    </Animated.View>
  );

  return (
    <Animated.View
      testID="primary-cta"
      style={[
        {
          width: ctaWidth,
          alignSelf: 'center',
        },
        animated,
      ]}
    >
      {cream ? (
        <Animated.View
          testID="cta-shadow"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.shadow, shadow]}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: blocked, busy: loading }}
        accessibilityHint={disabled ? disabledHint : undefined}
        disabled={blocked}
        onPress={onPress}
        onPressIn={() => press(true)}
        onPressOut={() => press(false)}
      >
        {cream ? (
          <LinearGradient
            colors={CREAM_STOPS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cream}
          >
            {content}
            {loading ? <TideLine /> : null}
          </LinearGradient>
        ) : (
          <View style={styles.frost}>
            <GlassBlur />
            <View style={[StyleSheet.absoluteFill, styles.frostFill]} />
            {content}
            {loading ? <TideLine /> : null}
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
  cream: { borderRadius: tokens.radius.button, overflow: 'hidden' },
  // Its own layer, so the shadow fades with the pill instead of arriving in one frame.
  shadow: { borderRadius: tokens.radius.button, boxShadow: tokens.shadow.button },
  content: {
    height: tokens.size.primaryButtonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: tokens.space[24],
  },
});
