import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

type Props = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  hint?: string;
};

/** A calm glass pill: the one action on a quiet page. 48 pt tall, with a label that never shouts. */
export function QuietAction({ label, onPress, busy, hint }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}
    >
      <GlassCard radius={tokens.radius.pill}>
        <View style={styles.inside}>
          {busy ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <EchoText variant="label" numberOfLines={1}>
              {label.toUpperCase()}
            </EchoText>
          )}
        </View>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: 'center' },
  pressed: { opacity: 0.72 },
  inside: {
    minHeight: 48,
    minWidth: 200,
    paddingHorizontal: tokens.space[24],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
