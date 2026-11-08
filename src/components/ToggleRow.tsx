import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { EchoText } from './EchoText';
import { GlassBlur } from './GlassCard';
import { SwitchTrack } from './SwitchTrack';

// Measured from the Privacy goldens, which differ from the token sizes (docs/SPEC_CONFLICTS.md, C-13).
const ROW_HEIGHT = 49;
const RADIUS = 14;
const BORDER = 'rgba(255,255,255,0.3)';

type Props = {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Read by screen readers, for example why the option is unavailable. */
  hint?: string;
  icon?: ReactNode;
  /** Strong glass, for the accessible layout at large text sizes. */
  strength?: 'regular' | 'strong';
};

export function ToggleRow({
  label,
  value,
  onChange,
  disabled = false,
  hint,
  icon,
  strength = 'regular',
}: Props) {
  const { colors } = useTheme();

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
      {({ pressed }) => (
        <View style={styles.shadow}>
          <View style={styles.clip}>
            <GlassBlur
              radius={strength === 'strong' ? tokens.blur.glassStrong : tokens.blur.glass}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    strength === 'strong' ? colors.surfaceGlassStrong : colors.surfaceGlass,
                },
              ]}
            />
            <View style={styles.content}>
              {icon}
              <EchoText variant="bodyM" color="textSecondary" style={styles.label}>
                {label}
              </EchoText>
              <SwitchTrack value={value} pressed={pressed} />
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: RADIUS, boxShadow: tokens.shadow.glass },
  clip: { borderRadius: RADIUS, borderColor: BORDER, borderWidth: 1, overflow: 'hidden' },
  content: {
    minHeight: ROW_HEIGHT - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
    paddingLeft: 20,
    paddingRight: 18,
  },
  label: { flex: 1, fontSize: 12.5, lineHeight: 18, letterSpacing: -0.3 },
});
