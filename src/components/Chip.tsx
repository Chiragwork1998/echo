import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { usePressScale } from '@/design/press';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

type ChipProps = {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Small single-select chip used for reminder presets and theme choice. Shares
 * the segmented-control material: cream capsule with ink text when selected,
 * glass with a hairline edge when not.
 */
export function Chip({ disabled = false, label, onPress, selected, style }: ChipProps) {
  const { theme } = useEchoTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  return (
    <Animated.View style={[styles.wrap, style, animatedStyle]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.chip,
          style ? styles.chipStretch : null,
          selected
            ? {
                backgroundColor: theme.color.surfacePrimary,
                borderColor: theme.color.hairlineStrong,
              }
            : {
                backgroundColor: 'transparent',
                borderColor: theme.color.hairlineSoft,
              },
        ]}
      >
        <View pointerEvents="none">
          <Text
            style={[
              styles.label,
              { color: selected ? theme.color.textInk : theme.color.textPrimary },
            ]}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 0 },
  chipStretch: { flex: 1 },
  chip: {
    minHeight: tokens.size.tapTarget,
    borderRadius: tokens.control.pillRadius,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[16],
  },
  label: {
    ...tokens.type.uiMedium,
    fontSize: tokens.typography.caption.size + 1,
    letterSpacing: tokens.typography.button.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
});
