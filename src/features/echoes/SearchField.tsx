import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';
import { textStyle } from '@/design/typography';
import { tokens } from '@/design/tokens';

import { echoesCopy } from './echoesCopy';

type Props = { value: string; onChange: (next: string) => void };

/**
 * The query is typed text, so autofill and suggestion stores stay off, as they do for the journal
 * itself (docs/DATA_CONTRACT.md). It is held in memory only and never saved.
 */
export function SearchField({ value, onChange }: Props) {
  const { colors } = useTheme();
  return (
    <GlassCard radius={tokens.radius.medium}>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChange}
          accessibilityLabel={echoesCopy.searchLabel}
          placeholder={echoesCopy.searchPlaceholder}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          maxFontSizeMultiplier={1.6}
          style={[styles.input, textStyle('bodyM'), { color: colors.textPrimary }]}
        />
        {value.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={echoesCopy.clearSearch}
            onPress={() => onChange('')}
            style={styles.clear}
          >
            <EchoText variant="label">×</EchoText>
          </Pressable>
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: tokens.space[16] },
  input: { flex: 1, minHeight: tokens.size.primaryButtonHeight, paddingVertical: tokens.space[8] },
  clear: {
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
