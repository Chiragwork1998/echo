import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type TextStyle } from 'react-native';

import { useTheme } from '@/design/theme';
import { textStyle } from '@/design/typography';
import { tokens } from '@/design/tokens';
import { Surface, TextAction } from '@/features/tab-pages/parts';

import { echoesCopy } from './echoesCopy';

type Props = { value: string; onChange: (next: string) => void };

const HEIGHT = 48;
/** The browser draws its own ring inside the pill; the pill's edge shows focus instead. */
const NO_BROWSER_RING = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

/**
 * A pill of glass to type into. Its edge brightens to the focus token while it has focus. The query
 * is typed text, so autofill and suggestion stores stay off, as they do for the journal itself
 * (docs/DATA_CONTRACT.md). It is held in memory only and never saved.
 */
export function SearchField({ value, onChange }: Props) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Surface radius={HEIGHT / 2} style={focused ? { borderColor: colors.focus } : undefined}>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
          style={[styles.input, textStyle('bodyM'), { color: colors.textPrimary }, NO_BROWSER_RING]}
        />
        {value.length > 0 && (
          <TextAction
            label={echoesCopy.clear}
            spoken={echoesCopy.clearSearch}
            onPress={() => onChange('')}
            tone="textSecondary"
            style={styles.clear}
          />
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: tokens.space[20] },
  input: { flex: 1, minHeight: HEIGHT, paddingVertical: tokens.space[8] },
  clear: { alignSelf: 'center', paddingHorizontal: tokens.space[16] },
});
