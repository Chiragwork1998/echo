import { Fragment, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  runOnJS,
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
import { ArriveInOrder, useLaidOut } from '@/features/tab-pages/Resolve';

import { echoesCopy } from './echoesCopy';
import { monthKey, monthTitle } from './entryFacts';
import { EntryRow, EntryRowSkeleton, ROW_TEXT_INSET } from './EntryRow';
import { useRemovedEchoes } from './removed';

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

/** A row on the list: one that is leaving was deleted, and is held in its place while it goes. */
type Listed = { entry: EntrySummary; leaving: boolean };

const sameListed = (a: readonly Listed[], b: readonly Listed[]) =>
  a.length === b.length &&
  a.every((item, index) => item.entry === b[index]?.entry && item.leaving === b[index]?.leaving);

/**
 * What the list draws: the rows it was given, and, in the places they were, the rows that were
 * deleted and are still on their way out. A row that leaves for any other reason (a search changes
 * which rows there are) goes at once, as it always did; only a deletion has an exit.
 */
export function listRows(
  before: readonly Listed[],
  rows: readonly EntrySummary[],
  removed: ReadonlySet<string>,
): readonly Listed[] {
  const wanted = new Set(rows.map(({ id }) => id));
  // Each leaving row comes after the row that was before it and is still here.
  const after = new Map<string | null, Listed[]>();
  let anchor: string | null = null;
  for (const item of before) {
    if (wanted.has(item.entry.id)) anchor = item.entry.id;
    else if (item.leaving || removed.has(item.entry.id)) {
      after.set(anchor, [...(after.get(anchor) ?? []), { entry: item.entry, leaving: true }]);
    }
  }
  const next: Listed[] = [...(after.get(null) ?? [])];
  for (const entry of rows) next.push({ entry, leaving: false }, ...(after.get(entry.id) ?? []));
  return sameListed(before, next) ? before : next;
}

/** A deleted row leaves in this long: it fades and narrows, and the rows below close the gap. */
const LEAVE_MS = 240;
/** Before its size is known, a leaving row is not limited. */
const UNLIMITED = 100000;

/**
 * A row that has been deleted, on its way out. It keeps its place and its size until it has been
 * laid out, then fades (a month's glass does not: glass under a fading ancestor loses its blur) and
 * narrows to nothing, and the rows below are carried up with it. All of it is drawn on the UI thread.
 * Under Reduce Motion it only fades, and the gap closes when it has gone. It cannot be touched, and
 * screen readers never see it.
 */
function Leaving({
  testID,
  fades,
  onGone,
  children,
}: PropsWithChildren<{ testID: string; fades: boolean; onGone: () => void }>) {
  const reduced = useReduceMotion();
  const { placed, onLayout: laidOut } = useLaidOut(true);
  const measured = useRef(false);
  // What to do when it has gone is the parent's, and may change; the animation must not restart for it.
  const gone = useRef(onGone);
  useEffect(() => {
    gone.current = onGone;
  });
  const finish = useCallback(() => gone.current(), []);
  const open = useSharedValue(1);
  // How tall it is when whole, which it says when it is laid out.
  const whole = useSharedValue(0);
  useEffect(() => {
    if (!placed) return;
    open.set(
      withTiming(
        0,
        {
          duration: reduced ? tokens.motion.fast : LEAVE_MS,
          easing: EASE,
          reduceMotion: ReduceMotion.Never,
        },
        (finished) => {
          'worklet';
          if (finished) runOnJS(finish)();
        },
      ),
    );
  }, [finish, open, placed, reduced]);
  const narrow = !reduced;
  const style = useAnimatedStyle(() => ({
    opacity: fades ? open.get() : 1,
    maxHeight: narrow && whole.get() > 0 ? whole.get() * open.get() : UNLIMITED,
  }));
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => {
        // Only its first size is its own: after that it is being narrowed.
        if (!measured.current && event.nativeEvent.layout.height > 0) {
          measured.current = true;
          whole.set(event.nativeEvent.layout.height);
        }
        laidOut?.();
      }}
      style={[styles.leaving, style]}
    >
      {children}
    </Animated.View>
  );
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
  // One style for the view's whole life, whole when there is glass in the list: taking the style
  // away when the glass is found would draw the list plain, at once, with nothing said of its fade.
  const dimmed = useAnimatedStyle(() => ({ opacity: glass ? 1 : dim.get() }));

  // The rows as drawn: those given, and deleted ones still leaving, each in its place.
  const removed = useRemovedEchoes((state) => state.ids);
  const [listed, setListed] = useState<readonly Listed[]>(() =>
    rows.map((entry) => ({ entry, leaving: false })),
  );
  const current = listRows(listed, rows, removed);
  if (current !== listed) setListed(current);
  const gone = (ids: readonly string[]) =>
    setListed((now) => now.filter(({ entry }) => !ids.includes(entry.id)));
  const leavingIds = new Set(current.filter(({ leaving }) => leaving).map(({ entry }) => entry.id));

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
          style={[styles.months, dimmed]}
          pointerEvents={waiting ? 'none' : 'auto'}
          accessibilityElementsHidden={waiting}
          importantForAccessibility={waiting ? 'no-hide-descendants' : 'auto'}
        >
          {byMonth(current.map(({ entry }) => entry)).map((month) => {
            const first = index;
            // A month whose every echo was deleted goes as one: it rolls up, glass and all.
            const wholeMonth = month.rows.every(({ id }) => leavingIds.has(id));
            const body = (
              <View key={month.key || 'undated'} style={styles.month}>
                {month.title ? (
                  <ArriveInOrder index={first} step={ROW_STEP_MS} cap={ROWS_THAT_ARRIVE}>
                    <Heading>{month.title}</Heading>
                  </ArriveInOrder>
                ) : null}
                <Surface>
                  {month.rows.map((entry, row) => {
                    // The hairline above a row is there when a row that stays is above it.
                    const staying = month.rows.slice(0, row).some(({ id }) => !leavingIds.has(id));
                    const drawn = (
                      <>
                        {staying && <Between />}
                        {leavingIds.has(entry.id) ? (
                          <EntryRow entry={entry} onOpen={onOpen} />
                        ) : (
                          <ArriveInOrder index={index++} step={ROW_STEP_MS} cap={ROWS_THAT_ARRIVE}>
                            <EntryRow entry={entry} onOpen={onOpen} />
                          </ArriveInOrder>
                        )}
                      </>
                    );
                    return leavingIds.has(entry.id) && !wholeMonth ? (
                      <Leaving
                        key={entry.id}
                        testID={`echo-row-${entry.id}-leaving`}
                        fades
                        onGone={() => gone([entry.id])}
                      >
                        {drawn}
                      </Leaving>
                    ) : (
                      <Fragment key={entry.id}>{drawn}</Fragment>
                    );
                  })}
                </Surface>
              </View>
            );
            return wholeMonth ? (
              <Leaving
                key={month.key || 'undated'}
                testID={`echo-month-${month.key}-leaving`}
                fades={false}
                onGone={() => gone(month.rows.map(({ id }) => id))}
              >
                {body}
              </Leaving>
            ) : (
              body
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
  // A row that has been deleted narrows inside its own bounds: nothing of it shows past them.
  leaving: { overflow: 'hidden' },
  between: {
    height: StyleSheet.hairlineWidth,
    marginLeft: ROW_TEXT_INSET,
    marginRight: tokens.space[16],
    opacity: 0.16,
  },
});
