import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { G, Line } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { TrackedText } from '@/components/TrackedText';
import { copy } from '@/content/copy';
import { goldenCopy } from '@/content/goldenCopy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import type { Rhythm } from '@/features/journal';

import { BuildingCairn, Cairn } from './Cairn';
import { FadeLayer } from './FadeLayer';
import { homeLabels } from './homeLabels';
import {
  COUNT_AT_MS,
  COUNT_IN_LAG_MS,
  COUNT_IN_MS,
  COUNT_OUT_MS,
  LABEL_AT_MS,
  LABEL_MS,
  REDUCED_MS,
} from './stoneMotion';
import type { StoneView } from './useStoneArrival';
import { useBeat } from './useBeat';

const CAIRN_SIZE = 23;
const LABEL_SIZE = 9.5;
const TRAIL_INSET = 0.052; // of the row, so the trail stops short of each cairn
const DAYS = 7;

const weekdayName = (localDay: string) => {
  const [year, month, date] = localDay.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).toLocaleDateString(undefined, {
    weekday: 'long',
  });
};

const AnimatedG = Animated.createAnimatedComponent(G);

/** Part of the trail, fading from one strength to another: opacity of its own group, nothing else. */
function TrailFade({
  at,
  ms,
  from,
  to,
  children,
}: {
  at: number;
  ms: number;
  from: number;
  to: number;
  children: ReactNode;
}) {
  const beat = useBeat(at, ms);
  const props = useAnimatedProps(() => ({ opacity: from + (to - from) * beat.get() }));
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

/** The weekday under a cairn, as the golden sets it: plain once the day is done, quiet until then. */
function DayLabel({ weekday, completed }: { weekday: string; completed: boolean }) {
  return (
    <TrackedText
      text={weekday.toUpperCase()}
      tracking={1.9}
      variant="caption"
      color={completed ? 'textPrimary' : 'textSecondary'}
      style={[styles.dayLabel, !completed && styles.dayLabelOpen]}
    />
  );
}

/** The count line, as the golden sets it. */
function CountLine({ count, align }: { count: number; align: 'left' | 'right' }) {
  return (
    <EchoText variant="caption" color="textSecondary" align={align} style={styles.count}>
      {goldenCopy.nightRhythm(count)}
    </EchoText>
  );
}

/**
 * THIS WEEK: seven cairns, Monday to Sunday. Filled is done, outlined is still to come.
 *
 * When a stone is being set (`stones` is playing), today's cairn is built before the person's eyes,
 * its weekday goes from the quiet word to the plain one, and the count line gives way to the new
 * count. Everything else on the row is as it always is, and when the arrival ends the row is the
 * plain row again.
 */
export function WeekRhythm({
  rhythm,
  loading,
  stones,
}: {
  rhythm: Rhythm;
  loading: boolean;
  stones?: StoneView;
}) {
  const { accessibleLayout } = useLayout();
  const { colors } = useTheme();
  const { week, weekReflections } = rhythm;
  const shown = week.length === DAYS ? week : [];
  const playing = stones?.phase === 'playing' ? stones : null;
  const reduced = playing?.reduced ?? false;
  // A stone is being set in today's cairn: its weekday and its link to tomorrow change with it.
  const keeping = playing !== null && playing.kind !== 'digits';
  // The count changes only when the count did; a set stone with the same count (never) does not.
  const countFrom =
    playing && playing.before.total !== weekReflections ? playing.before.total : null;
  const countAlign = accessibleLayout ? 'left' : 'right';

  return (
    <View style={styles.root}>
      <View style={[styles.heading, accessibleLayout && styles.headingStacked]}>
        <EchoText variant="label" style={styles.eyebrow} maxFontSizeMultiplier={1.3}>
          {copy.home.thisWeek.toUpperCase()}
        </EchoText>
        {!loading && weekReflections > 0 && (
          <View style={styles.countWrap}>
            {countFrom === null ? (
              <CountLine count={weekReflections} align={countAlign} />
            ) : (
              <>
                <FadeLayer
                  at={reduced ? 0 : COUNT_AT_MS + COUNT_IN_LAG_MS}
                  ms={reduced ? REDUCED_MS : COUNT_IN_MS}
                  from={0}
                  to={1}
                >
                  <CountLine count={weekReflections} align={countAlign} />
                </FadeLayer>
                {countFrom > 0 && (
                  <FadeLayer
                    leaving
                    at={reduced ? 0 : COUNT_AT_MS}
                    ms={reduced ? REDUCED_MS : COUNT_OUT_MS}
                    from={1}
                    to={0}
                  >
                    <CountLine count={countFrom} align={countAlign} />
                  </FadeLayer>
                )}
              </>
            )}
          </View>
        )}
      </View>

      <View style={styles.days} accessibilityRole="list" accessibilityLabel={homeLabels.weekRhythm}>
        <Svg style={styles.trail} width="100%" height={CAIRN_SIZE} pointerEvents="none">
          {shown.slice(0, -1).map(({ day, completed, isToday }, i) => {
            // The link from a day to the next: dashed once the day is kept, a quiet line until then.
            const link = (kept: boolean) => (
              <Line
                key={day}
                x1={`${((i + 0.5) / DAYS + TRAIL_INSET) * 100}%`}
                x2={`${((i + 1.5) / DAYS - TRAIL_INSET) * 100}%`}
                y1={CAIRN_SIZE / 2 + 3}
                y2={CAIRN_SIZE / 2 + 3}
                stroke={colors.textSecondary}
                strokeOpacity={kept ? 0.55 : 0.3}
                strokeWidth={StyleSheet.hairlineWidth * 1.4}
                strokeDasharray={kept ? '3 3' : undefined}
              />
            );
            // Today's link gives way to the kept one as the day's weekday does, not before.
            return keeping && isToday ? (
              <G key={day}>
                <TrailFade
                  at={reduced ? 0 : LABEL_AT_MS}
                  ms={reduced ? REDUCED_MS : LABEL_MS}
                  from={1}
                  to={0}
                >
                  {link(false)}
                </TrailFade>
                <TrailFade
                  at={reduced ? 0 : LABEL_AT_MS}
                  ms={reduced ? REDUCED_MS : LABEL_MS}
                  from={0}
                  to={1}
                >
                  {link(true)}
                </TrailFade>
              </G>
            ) : (
              link(completed)
            );
          })}
        </Svg>
        {shown.map(({ day, weekday, completed, isToday }) => (
          <View
            key={day}
            style={styles.day}
            accessible
            accessibilityRole="text"
            accessibilityLabel={[
              weekdayName(day),
              completed ? homeLabels.completed : null,
              isToday ? copy.home.tabs[0] : null,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            {keeping && isToday ? (
              <>
                <BuildingCairn size={CAIRN_SIZE} reduced={reduced} />
                <View>
                  <FadeLayer
                    at={reduced ? 0 : LABEL_AT_MS}
                    ms={reduced ? REDUCED_MS : LABEL_MS}
                    from={0}
                    to={1}
                  >
                    <DayLabel weekday={weekday} completed />
                  </FadeLayer>
                  {/* The quiet word already carries its own 0.6, so it leaves from 1: no dip first. */}
                  <FadeLayer
                    leaving
                    at={reduced ? 0 : LABEL_AT_MS}
                    ms={reduced ? REDUCED_MS : LABEL_MS}
                    from={1}
                    to={0}
                  >
                    <DayLabel weekday={weekday} completed={false} />
                  </FadeLayer>
                </View>
              </>
            ) : (
              <>
                <Cairn built={completed} size={CAIRN_SIZE} />
                <DayLabel weekday={weekday} completed={completed} />
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  // Always as tall as the count line, so that it arriving moves nothing beneath it.
  heading: {
    minHeight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headingStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  eyebrow: { fontSize: 9.5, lineHeight: 13, letterSpacing: 1.9, opacity: 0.92, flexShrink: 0 },
  countWrap: { flexShrink: 1 },
  count: { fontSize: 10.5, lineHeight: 14, letterSpacing: 0, opacity: 0.94 },
  days: { flexDirection: 'row' },
  trail: { position: 'absolute', left: 0, right: 0, top: 0 },
  day: { flex: 1, alignItems: 'center', gap: 5 },
  dayLabel: { fontSize: LABEL_SIZE, lineHeight: 14 },
  dayLabelOpen: { opacity: 0.6 },
});
