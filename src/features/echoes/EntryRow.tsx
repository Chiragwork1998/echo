import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { tokens } from '@/design/tokens';
import type { EntrySummary } from '@/features/journal';
import { supporting } from '@/features/tab-pages/textStyles';

import { echoesCopy } from './echoesCopy';
import { entryMeta, entryPreview, entryTitle } from './entryFacts';

/**
 * One archived echo. An unreadable one stays in the list and says so. It opens to a page that can
 * still delete it, because that is the only way a damaged row can ever be cleared.
 */
export function EntryRow({ entry, onOpen }: { entry: EntrySummary; onOpen: (id: string) => void }) {
  const title = entryTitle(entry);
  const meta = entryMeta(entry);
  const preview = entryPreview(entry);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={meta ? `${title}. ${meta}` : title}
      accessibilityHint={entry.readable ? echoesCopy.openHint : echoesCopy.unreadableHint}
      onPress={() => onOpen(entry.id)}
      style={({ pressed }) => pressed && styles.pressed}
      testID={`echo-row-${entry.id}`}
    >
      <GlassCard radius={tokens.radius.medium}>
        <View style={styles.row}>
          <EchoText
            variant="bodyL"
            serif
            numberOfLines={2}
            color={entry.readable ? 'textPrimary' : 'textSecondary'}
            maxFontSizeMultiplier={1.6}
          >
            {title}
          </EchoText>
          {preview ? (
            <EchoText variant="bodyM" color="textSecondary" numberOfLines={2}>
              {preview}
            </EchoText>
          ) : null}
          {meta ? (
            <EchoText variant="caption" color="textSecondary" style={supporting}>
              {meta}
            </EchoText>
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: tokens.size.tapTarget + 16,
    gap: tokens.space[4],
    paddingHorizontal: tokens.space[16],
    paddingVertical: tokens.space[12],
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
});
