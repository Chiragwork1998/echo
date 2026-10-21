import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { usePressScale } from '@/design/press';
import { useEchoTheme } from '@/design/ThemeProvider';
import { CTA } from '@/design/onboardingLayout';
import { tokens } from '@/design/tokens';

type PrimaryCTAProps = {
  accessibilityHint?: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  showArrow?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryCTA({
  accessibilityHint,
  disabled = false,
  label,
  onPress,
  showArrow = false,
  style,
}: PrimaryCTAProps) {
  const { theme } = useEchoTheme();
  const { animatedStyle, onPressIn, onPressOut, pressed } = usePressScale();

  const surface = disabled
    ? {
        backgroundColor: theme.color.ctaDisabledFill,
        borderColor: theme.color.ctaDisabledBorder,
        color: theme.color.ctaDisabledInk,
      }
    : {
        backgroundColor: theme.color.surfacePrimary,
        borderColor: theme.color.hairlineStrong,
        color: theme.color.textInk,
      };

  return (
    <Animated.View
      style={[
        styles.wrap,
        style,
        disabled && styles.wrapDisabled,
        pressed && !disabled && styles.wrapPressed,
        animatedStyle,
      ]}
    >
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.cta,
          { backgroundColor: surface.backgroundColor, borderColor: surface.borderColor },
        ]}
      >
        {disabled ? null : (
          <View
            pointerEvents="none"
            style={[styles.highlight, { backgroundColor: theme.color.ctaHighlight }]}
          />
        )}
        <View pointerEvents="none" style={styles.content}>
          <Text style={[styles.label, { color: surface.color }]}>{label}</Text>
          {showArrow ? (
            <View style={styles.arrow}>
              <Svg height={CTA.arrow.height} viewBox="0 0 22 16" width={CTA.arrow.width}>
                <Path
                  d="M2 8h16M12 2.6 17.4 8 12 13.4"
                  fill="none"
                  stroke={surface.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={CTA.arrow.strokeWidth}
                />
              </Svg>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: CTA.maxWidth,
    height: CTA.height,
    borderRadius: CTA.radius,
    shadowColor: tokens.control.shadow.color,
    shadowOffset: { width: 0, height: tokens.control.shadow.offsetY },
    shadowOpacity: tokens.control.shadow.opacity,
    shadowRadius: tokens.control.shadow.radius,
    elevation: tokens.control.shadow.elevation,
  },
  wrapDisabled: { shadowOpacity: 0, elevation: 0 },
  wrapPressed: {
    shadowOpacity: tokens.control.shadow.opacity * 0.8,
    elevation: tokens.control.shadow.elevation * 0.8,
  },
  cta: {
    flex: 1,
    borderRadius: CTA.radius,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 1 pt top inner light instead of a gradient fill. */
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  content: { flexDirection: 'row', alignItems: 'center' },
  arrow: { marginLeft: CTA.arrow.gap },
  label: {
    ...tokens.type.uiMedium,
    fontSize: CTA.label.size,
    letterSpacing: CTA.label.tracking,
    lineHeight: CTA.label.lineHeight,
  },
});
