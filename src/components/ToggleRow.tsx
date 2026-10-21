import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { EchoIcon, type EchoIconName } from './EchoIcon';
import { GlassCard } from './GlassCard';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

type ToggleRowProps = {
  caption?: string;
  disabled?: boolean;
  icon?: EchoIconName;
  label: string;
  onValueChange: (value: boolean) => void;
  /** Capability is missing on this device; the row explains instead of toggling. */
  unavailableCaption?: string;
  value: boolean;
};

/** Minimum 60 pt row, on/off/disabled/unavailable states (`specs/COMPONENTS.md`). */
export function ToggleRow({
  caption,
  disabled = false,
  icon,
  label,
  onValueChange,
  unavailableCaption,
  value,
}: ToggleRowProps) {
  const { theme } = useEchoTheme();
  const unavailable = unavailableCaption !== undefined;
  const inactive = disabled || unavailable;
  const labelColor = inactive ? theme.color.textSecondary : theme.color.textPrimary;

  return (
    <GlassCard focused={value && !inactive} style={styles.card}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled: inactive }}
        disabled={inactive}
        onPress={() => onValueChange(!value)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {icon ? <EchoIcon color={labelColor} name={icon} size={22} /> : null}
        <View style={styles.copy}>
          <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
          {unavailable ? (
            <Text style={[styles.caption, { color: theme.color.textSecondary }]}>
              {unavailableCaption}
            </Text>
          ) : caption ? (
            <Text style={[styles.caption, { color: theme.color.textSecondary }]}>{caption}</Text>
          ) : null}
        </View>
        <Switch
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          ios_backgroundColor="rgba(255,255,255,0.24)"
          onValueChange={onValueChange}
          thumbColor="#FFFDF7"
          trackColor={{ false: 'rgba(255,255,255,0.24)', true: theme.color.accentWarm }}
          value={value && !inactive}
        />
      </Pressable>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch' },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
    paddingVertical: tokens.space[12],
  },
  pressed: { opacity: 0.72 },
  copy: { flex: 1 },
  label: {
    ...tokens.type.uiMedium,
    fontSize: tokens.typography.bodyM.size,
    letterSpacing: tokens.typography.bodyM.tracking,
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
  caption: {
    marginTop: tokens.space[2],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
});
