import { Fragment, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ArrivalContext, useGlassAware } from '@/components/arrival';
import { EASE } from '@/design/ease';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import type { EntrySummary } from '@/features/journal';
import { Heading, Loading, Surface } from '@/features/tab-pages/parts';
import { ArriveInOrder } from '@/features/tab-pages/Resolve';

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

/** A search that answers inside this never dims the list at all. */
const DIM_AFTER_MS = 400;
const DIMMED = 0.6;
/** When the archive first opens from its skeleton, the first rows arrive this far apart. */
const ROW_STEP_MS = 40;
const ROWS_THAT_ARRIVE = 8;

/**
 * The archive: one piece of glass for each month, a hairline between its echoes. Rows left waiting
 * on a search are dimmed (only if the answer takes more than 400 ms, and gently), cannot be touched,
 * and are hidden from screen readers, which hear that the search is running instead. The list is
 * one tree whether it waits or not, so the months are never torn down and drawn again.
 */
export function EchoesList({ rows, onOpen, waiting = false }: Props) {
  const reduced = useReduceMotion();
  const dim = useSharedValue(1);
  useEffect(() => {
    dim.set(
      waiting
        ? withDelay(
            DIM_AFTER_MS,
            withTiming(DIMMED, {
              duration: reduced ? tokens.motion.fast : tokens.motion.standard,
              easing: EASE,
              reduceMotion: ReduceMotion.Never,
            }),
          )
        : withTiming(1, {
            duration: tokens.motion.fast,
            easing: EASE,
            reduceMotion: ReduceMotion.Never,
          }),
    );
  }, [dim, reduced, waiting]);
  // Dimmed glass loses its blur on Android, so with glass in the list the list stays whole and the
  // rows on the glass are what dim.
  const { glass, arrival } = useGlassAware(dim);
  const dimmed = useAnimatedStyle(() => ({ opacity: dim.get() }));

  let index = 0;
  return (
    <View
      accessible={waiting}
      accessibilityLabel={waiting ? echoesCopy.searching : undefined}
      accessibilityState={waiting ? { busy: true } : undefined}
      accessibilityLiveRegion={waiting ? 'polite' : 'none'}
    >
      <ArrivalContext.Provider value={arrival}>
        <Animated.View
          style={[styles.months, glass ? undefined : dimmed]}
          pointerEvents={waiting ? 'none' : 'auto'}
          accessibilityElementsHidden={waiting}
          importantForAccessibility={waiting ? 'no-hide-descendants' : 'auto'}
        >
          {byMonth(rows).map((month) => {
            const first = index;
            return (
              <View key={month.key || 'undated'} style={styles.month}>
                {month.title ? (
                  <ArriveInOrder index={first} step={ROW_STEP_MS} cap={ROWS_THAT_ARRIVE}>
                    <Heading>{month.title}</Heading>
                  </ArriveInOrder>
                ) : null}
                <Surface>
                  {month.rows.map((entry, row) => (
                    <Fragment key={entry.id}>
                      {row > 0 && <Between />}
                      <ArriveInOrder index={index++} step={ROW_STEP_MS} cap={ROWS_THAT_ARRIVE}>
                        <EntryRow entry={entry} onOpen={onOpen} />
                      </ArriveInOrder>
                    </Fragment>
                  ))}
                </Surface>
              </View>
            );
          })}
        </Animated.View>
      </ArrivalContext.Provider>
    </View>
  );
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
  between: {
    height: StyleSheet.hairlineWidth,
    marginLeft: ROW_TEXT_INSET,
    marginRight: tokens.space[16],
    opacity: 0.16,
  },
});
