import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceMarker } from '@/components/ChoiceMarker';
import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { tokens } from '@/design/tokens';
import type { Mood } from '@/state/onboarding';

type Props = {
  options: readonly { value: Mood; label: string }[];
  selected?: Mood;
  onSelect: (value: Mood) => void;
  accessibilityLabel: string;
};

/**
 * The five moods as a plain list on strong glass, for where the stream cannot hold the words: text
 * at 125% and above, and landscape. The stones, glow and rings are hidden then.
 */
export function MoodList({ options, selected, onSelect, accessibilityLabel }: Props) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={styles.list}
    >
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
