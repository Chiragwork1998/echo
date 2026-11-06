import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceMarker } from '@/components/ChoiceMarker';
import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { tokens } from '@/design/tokens';
import type { Intent } from '@/state/onboarding';

type Props = {
  options: readonly { value: Intent; label: string }[];
  selected?: Intent;
  onSelect: (value: Intent) => void;
};

/**
 * The four choices as a plain list on strong glass. Used where the river composition cannot hold the
 * labels: text at 125% and above, and landscape. The river points and trail are hidden then.
 */
export function ChoiceList({ options, selected, onSelect }: Props) {
  return (
    <View accessibilityRole="radiogroup" style={styles.list}>
      {options.map(({ value, label }) => {
        const chosen = value === selected;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected: chosen, checked: chosen }}
            onPress={() => onSelect(value)}
          >
            <GlassCard strength="strong" radius={tokens.radius.medium} contentStyle={styles.row}>
              <ChoiceMarker selected={chosen} />
              <EchoText variant="bodyL" serif style={styles.label}>
                {label}
              </EchoText>
            </GlassCard>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: tokens.space[12], alignSelf: 'stretch' },
  row: {
    minHeight: tokens.size.primaryButtonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[16],
    paddingHorizontal: tokens.space[20],
    paddingVertical: tokens.space[12],
  },
  label: { flex: 1 },
});
