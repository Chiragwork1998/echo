import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import type { EntrySummary } from '@/features/journal';
import { detail, itemTitle, supporting } from '@/features/tab-pages/textStyles';

import { echoesCopy } from './echoesCopy';
import { entryPreview, entryTitle, listMeta, longDate, marginDate } from './entryFacts';

/** The margin of the archive: the day of the month over its weekday, as a diary keeps it. */
const MARGIN = 34;
const SIDE = tokens.space[16];
const GAP = tokens.space[12];
/** Where a row's words begin, for the hairlines between rows, which start there. */
export const ROW_TEXT_INSET = SIDE + MARGIN + GAP;

// Lining figures: Cormorant's own old-style ones set a 1 like a capital I in a column of dates.
const DAY_NUMBER: TextStyle = {
  fontFamily: 'CormorantGaramond_400Regular',
  fontSize: 28,
  lineHeight: 30,
  fontVariant: ['lining-nums'],
};
const WEEKDAY = { fontSize: 11, lineHeight: 14, letterSpacing: 0.3 };

/**
 * One archived echo: its first words or its own title, and a quiet line of facts. An unreadable one
 * stays in the list and says so. It opens to a page that can still delete it, because that is the
 * only way a damaged row can ever be cleared.
 */
export function EntryRow({ entry, onOpen }: { entry: EntrySummary; onOpen: (id: string) => void }) {
  const { colors } = useTheme();
  const title = entryTitle(entry);
  const preview = entryPreview(entry);
  const margin = marginDate(entry.localDay);
  const meta = listMeta(entry);
  const spoken = [
    title,
    longDate(entry.localDay),
    meta.morning ? echoesCopy.morning : null,
    meta.rest || null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={entry.readable ? echoesCopy.openHint : echoesCopy.unreadableHint}
      onPress={() => onOpen(entry.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`echo-row-${entry.id}`}
    >
      <View
        style={styles.margin}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {margin ? (
          <>
            <EchoText variant="bodyL" style={DAY_NUMBER} maxFontSizeMultiplier={1.3}>
              {margin.day}
            </EchoText>
            <EchoText
              variant="caption"
              color="textSecondary"
              style={WEEKDAY}
              maxFontSizeMultiplier={1.3}
            >
              {margin.weekday}
            </EchoText>
          </>
        ) : null}
      </View>
      <View style={styles.text}>
        <EchoText
          variant="bodyL"
          numberOfLines={2}
          color={entry.readable ? 'textPrimary' : 'textSecondary'}
          maxFontSizeMultiplier={1.6}
          style={itemTitle}
        >
          {title}
        </EchoText>
        {preview ? (
          <EchoText
            variant="bodyM"
            color="textSecondary"
            numberOfLines={2}
            maxFontSizeMultiplier={1.6}
            style={detail}
          >
            {preview}
          </EchoText>
        ) : null}
        {meta.morning || meta.rest ? (
          <EchoText
            variant="caption"
            color="textSecondary"
            maxFontSizeMultiplier={1.6}
            style={[supporting, styles.meta]}
          >
            {meta.morning ? (
              <Text style={{ color: colors.accentWarm }}>{echoesCopy.morning}</Text>
            ) : null}
            {meta.morning && meta.rest ? ' · ' : ''}
            {meta.rest}
          </EchoText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** The same row, waiting: two bars where the words will be. */
export function EntryRowSkeleton({ width }: { width: `${number}%` }) {
  return (
    <View style={styles.row}>
      <View style={styles.margin}>
        <View style={[styles.bar, { width: 18, height: 18, borderRadius: 4 }]} />
        <View style={[styles.bar, { width: 22, height: 7 }]} />
      </View>
      <View style={[styles.text, styles.skeletonText]}>
        <View style={[styles.bar, { width, height: 13 }]} />
        <View style={[styles.bar, { width: '34%', height: 8 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: GAP,
    paddingLeft: SIDE,
    paddingRight: tokens.space[20],
    paddingVertical: 14,
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  margin: { minWidth: MARGIN, alignItems: 'center', paddingTop: 1 },
  text: { flex: 1, gap: tokens.space[4] },
  meta: { marginTop: 2 },
  skeletonText: { paddingTop: 6, gap: tokens.space[12] },
  bar: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 4, marginBottom: 4 },
});
