import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import type { EntrySummary } from '@/features/journal';
import { Heading, Loading, Surface } from '@/features/tab-pages/parts';

import { echoesCopy } from './echoesCopy';
import { monthKey, monthTitle } from './entryFacts';
import { EntryRow, EntryRowSkeleton, ROW_TEXT_INSET } from './EntryRow';

type Month = { key: string; title: string; rows: EntrySummary[] };

/** Echoes gathered under their month, keeping the order they came in: newest first. */
export function byMonth(rows: readonly EntrySummary[]): Month[] {
  const months: Month[] = [];
  for (const entry of rows) {
    const key = monthKey(entry.localDay);
    const last = months[months.length - 1];
    if (last && last.key === key) last.rows.push(entry);
    else months.push({ key, title: monthTitle(entry.localDay), rows: [entry] });
  }
  return months;
}

/** A hairline that starts where the words do, so the margin of dates runs unbroken. */
function Between() {
  const { colors } = useTheme();
  return <View style={[styles.between, { backgroundColor: colors.textPrimary }]} />;
}

type Props = {
  rows: readonly EntrySummary[];
  onOpen: (id: string) => void;
  /** Rows from before a search that is still running: shown, quietly, until the answer comes. */
  waiting?: boolean;
};

/**
 * The archive: one piece of glass for each month, a hairline between its echoes. Rows left waiting
 * on a search are dimmed, cannot be touched, and are hidden from screen readers, which hear that the
 * search is running instead.
 */
export function EchoesList({ rows, onOpen, waiting = false }: Props) {
  const list = (
    <View
      style={[styles.months, waiting && styles.waiting]}
      pointerEvents={waiting ? 'none' : 'auto'}
      accessibilityElementsHidden={waiting}
      importantForAccessibility={waiting ? 'no-hide-descendants' : 'auto'}
    >
      {byMonth(rows).map((month) => (
        <View key={month.key || 'undated'} style={styles.month}>
          {month.title ? <Heading>{month.title}</Heading> : null}
          <Surface>
            {month.rows.map((entry, index) => (
              <Fragment key={entry.id}>
                {index > 0 && <Between />}
                <EntryRow entry={entry} onOpen={onOpen} />
              </Fragment>
            ))}
          </Surface>
        </View>
      ))}
    </View>
  );
  return waiting ? <Loading label={echoesCopy.searching}>{list}</Loading> : list;
}

const WIDTHS = ['72%', '58%', '66%'] as const;

/** While the archive opens: the shape of a month of echoes, and nothing that spins. */
export function EchoesSkeleton() {
  return (
    <Loading label={echoesCopy.loading}>
      <Surface>
        {WIDTHS.map((width, index) => (
          <Fragment key={width}>
            {index > 0 && <Between />}
            <EntryRowSkeleton width={width} />
          </Fragment>
        ))}
      </Surface>
    </Loading>
  );
}

const styles = StyleSheet.create({
  months: { gap: tokens.space[32] },
  month: { gap: tokens.space[12] },
  waiting: { opacity: 0.5 },
  between: {
    height: StyleSheet.hairlineWidth,
    marginLeft: ROW_TEXT_INSET,
    marginRight: tokens.space[16],
    opacity: 0.16,
  },
});
