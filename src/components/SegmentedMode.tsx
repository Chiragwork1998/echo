import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { EchoIcon, type EchoIconName } from './EchoIcon';
import { usePressScale } from '@/design/press';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import type { JournalMode } from '@/state/journal';

export const SEGMENTED = { width: 345, height: 52, radius: 26, padding: 4 } as const;

const OPTIONS: readonly { icon: EchoIconName; id: JournalMode; label: string }[] = [
  { icon: 'pen', id: 'text', label: 'Write' },
  { icon: 'mic', id: 'voice', label: 'Speak' },
];

type SegmentedModeProps = {
  disabled?: boolean;
  onChange: (mode: JournalMode) => void;
  value: JournalMode;
};

/** 345 × 52, two equal halves (`specs/COMPONENTS.md` § SegmentedMode). */
export function SegmentedMode({ disabled = false, onChange, value }: SegmentedModeProps) {
  const { theme } = useEchoTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      style={[
        styles.track,
        { backgroundColor: theme.color.surfaceGlass, borderColor: theme.color.borderGlass },
        disabled && styles.disabled,
      ]}
    >
      {OPTIONS.map((option) => (
        <Segment
          disabled={disabled}
          icon={option.icon}
          key={option.id}
          label={option.label}
          onPress={() => onChange(option.id)}
          selected={option.id === value}
        />
      ))}
    </View>
  );
}

function Segment({
  disabled,
  icon,
  label,
  onPress,
  selected,
}: {
  disabled: boolean;
  icon: EchoIconName;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { theme } = useEchoTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  const contentColor = selected ? theme.color.textInk : theme.color.textPrimary;

  return (
    <Animated.View style={[styles.segmentWrap, animatedStyle]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.segment,
          selected && {
            backgroundColor: theme.color.surfacePrimary,
            borderColor: theme.color.hairlineStrong,
          },
        ]}
      >
        <EchoIcon color={contentColor} name={icon} opacity={selected ? 1 : 0.78} size={19} />
        <Text style={[styles.label, { color: contentColor }, !selected && styles.labelIdle]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    maxWidth: SEGMENTED.width,
    height: SEGMENTED.height,
    borderRadius: SEGMENTED.radius,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SEGMENTED.padding,
    flexDirection: 'row',
  },
  segmentWrap: { flex: 1 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: tokens.space[8],
    borderRadius: SEGMENTED.radius - SEGMENTED.padding,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...tokens.type.uiMedium,
    fontSize: tokens.typography.bodyM.size - 1,
    letterSpacing: tokens.typography.button.tracking,
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
  labelIdle: { opacity: 0.84 },
  disabled: { opacity: 0.5 },
});
