import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceMarker } from '@/components/ChoiceMarker';
import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { tokens } from '@/design/tokens';

export type Option<V extends string> = { value: V; title: string; detail: string };

type Props<V extends string> = {
  label: string;
  options: readonly Option<V>[];
  selected?: V;
  onSelect: (value: V) => void;
};

/**
 * The three choices as a plain list on strong glass. Used where the scene cannot hold them: text at
 * 125% and above, and landscape, where the portrait photograph no longer fits.
 */
export function ChoiceList<V extends string>({ label, options, selected, onSelect }: Props<V>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
      {options.map(({ value, title, detail }) => {
        const chosen = value === selected;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={`${title}. ${detail}`}
            accessibilityState={{ selected: chosen, checked: chosen }}
            onPress={() => onSelect(value)}
          >
            <GlassCard strength="strong" radius={tokens.radius.medium} contentStyle={styles.row}>
              <ChoiceMarker selected={chosen} />
              <View style={styles.text}>
                <EchoText variant="bodyL" serif>
                  {title}
                </EchoText>
                <EchoText variant="bodyM" color="textSecondary">
                  {detail}
                </EchoText>
              </View>
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
  text: { flex: 1 },
});
