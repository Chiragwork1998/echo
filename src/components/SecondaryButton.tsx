import { Animated, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { EchoIcon, type EchoIconName } from './EchoIcon';
import { usePressScale } from '@/design/press';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

type SecondaryButtonProps = {
  accessibilityHint?: string;
  disabled?: boolean;
  /** `outline` is a glass pill with a hairline edge; `ghost` is text-only. */
  icon?: EchoIconName;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: 'ghost' | 'outline';
};

/**
 * The single secondary action in ECHO: same cream/ink family as the primary
 * pill, but glass instead of cream, and never a second competing call to
 * action. Used for "Write instead", "Skip", retry and sheet actions.
 */
export function SecondaryButton({
  accessibilityHint,
  disabled = false,
  icon,
  label,
  onPress,
  style,
  variant = 'outline',
}: SecondaryButtonProps) {
  const { theme } = useEchoTheme();
  const { animatedStyle, onPressIn, onPressOut, pressed } = usePressScale();

  const labelColor = disabled
    ? theme.color.textSecondary
    : variant === 'ghost'
      ? theme.color.focus
      : theme.color.textPrimary;

  return (
    <Animated.View style={[styles.wrap, variant === 'outline' && styles.outlineWrap, style, animatedStyle]}>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.pressable,
          variant === 'outline' && [
            styles.outline,
            {
              backgroundColor: theme.color.surfaceGlass,
              borderColor: theme.color.borderGlass,
            },
          ],
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {icon ? <EchoIcon color={labelColor} name={icon} size={18} /> : null}
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  outlineWrap: { width: '100%' },
  pressable: {
    minHeight: tokens.size.tapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[8],
    paddingHorizontal: tokens.space[16],
  },
  outline: {
    borderRadius: tokens.control.pillRadius,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.6 },
  label: {
    ...tokens.type.uiMedium,
    fontSize: tokens.typography.bodyM.size,
    letterSpacing: tokens.typography.button.tracking,
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
});
