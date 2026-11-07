import { StyleSheet, View, type TextStyle } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { tokens } from '@/design/tokens';
import { MOODS, moodLabel } from '@/features/echoes/entryFacts';
import { Cairn } from '@/features/home/today/Cairn';
import { keepTogether } from '@/features/tab-pages/keepTogether';
import {
  Heading,
  Loading,
  Notice,
  Quiet,
  Rule,
  SkeletonLine,
  Surface,
} from '@/features/tab-pages/parts';
import { TabPage } from '@/features/tab-pages/TabPage';
import { detail, question, supporting } from '@/features/tab-pages/textStyles';

import { PATTERNS_MIN, type MoodCounts, type Patterns, type WeekCounts } from './computePatterns';
import { PatternCardsSection } from './PatternCardsSection';
import { patternsCopy } from './patternsCopy';
import { usePatterns } from './usePatterns';

const CAIRN = 30;
/** The total, set like a page's own number: Cormorant, with figures that stand on the line. */
const TOTAL: TextStyle = {
  fontFamily: 'CormorantGaramond_400Regular',
  fontSize: 30,
  lineHeight: 34,
  fontVariant: ['lining-nums'],
};

/** "19 Oct", as the device writes a day and a month. */
function shortDay(localDay: string) {
  const [year, month, day] = localDay.split('-').map(Number);
  if (!year || !month || !day) return localDay;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function weekLabel(week: WeekCounts, index: number) {
  if (index === 0) return patternsCopy.thisWeek;
  if (index === 1) return patternsCopy.lastWeek;
  return patternsCopy.weekOf(shortDay(week.start));
}

/** "Light 2 · Steady 1": only the moods that were chosen that week, and nothing when none was. */
function moodLine(counts: MoodCounts) {
  return MOODS.filter((mood) => counts[mood] > 0)
    .map((mood) => `${moodLabel(mood)} ${counts[mood]}`)
    .join(' · ');
}

/**
 * Before five reflections: a row of cairns, one built for each reflection so far, as Home counts the
 * week. The locked line, and how far along the person is. Nothing else is worked out or shown.
 */
function Locked({ count }: { count: number }) {
  const built = Math.min(count, PATTERNS_MIN);
  return (
    <Surface radius={tokens.radius.card}>
      <View style={styles.locked}>
        <View
          style={styles.cairns}
          accessible
          accessibilityRole="image"
          accessibilityLabel={patternsCopy.lockedSpoken(built, PATTERNS_MIN)}
        >
          {Array.from({ length: PATTERNS_MIN }, (_, index) => (
            <Cairn key={index} built={index < built} size={CAIRN} />
          ))}
        </View>
        <EchoText variant="bodyL" align="center" style={question} maxFontSizeMultiplier={1.5}>
          {keepTogether(patternsCopy.locked)}
        </EchoText>
        <EchoText
          variant="bodyM"
          color="textSecondary"
          align="center"
          style={detail}
          maxFontSizeMultiplier={1.6}
        >
          {keepTogether(patternsCopy.lockedSoFar(built, PATTERNS_MIN))}
        </EchoText>
      </View>
    </Surface>
  );
}

/** One week: when, how many, and the moods chosen, as a line of a ledger. */
function Week({ week, index }: { week: WeekCounts; index: number }) {
  const label = weekLabel(week, index);
  const count = patternsCopy.reflections(week.reflections);
  const moods = moodLine(week.moods);
  return (
    <View
      style={styles.week}
      accessible
      accessibilityLabel={[label, count, moods].filter(Boolean).join('. ')}
    >
      <View style={styles.weekText}>
        <EchoText variant="bodyM" maxFontSizeMultiplier={1.6}>
          {label}
        </EchoText>
        {moods ? (
          <EchoText
            variant="caption"
            color="textSecondary"
            style={supporting}
            maxFontSizeMultiplier={1.6}
          >
            {moods}
          </EchoText>
        ) : null}
      </View>
      <EchoText
        variant="bodyM"
        color={week.reflections > 0 ? 'textPrimary' : 'textSecondary'}
        style={detail}
        maxFontSizeMultiplier={1.6}
      >
        {count}
      </EchoText>
    </View>
  );
}

/** A small name inside the summary, for the part beneath it. */
function Label({ children }: { children: string }) {
  return (
    <EchoText
      variant="bodyM"
      color="textSecondary"
      accessibilityRole="header"
      style={[detail, styles.label]}
      maxFontSizeMultiplier={1.6}
    >
      {children}
    </EchoText>
  );
}

/**
 * The plain counts, read as a short summary rather than a dashboard: the total in words, the last
 * four weeks as a ledger, and the moods chosen on arrival on one line. Counts only, worked out here,
 * which the summary says at its foot.
 */
function Rhythm({ patterns }: { patterns: Patterns }) {
  return (
    <View style={styles.rhythm}>
      <Heading>{patternsCopy.rhythmTitle}</Heading>
      <Surface radius={tokens.radius.card}>
        <View style={styles.total}>
          <EchoText variant="bodyL" style={TOTAL} maxFontSizeMultiplier={1.4}>
            {patternsCopy.reflections(patterns.reflections)}
          </EchoText>
          <EchoText
            variant="bodyM"
            color="textSecondary"
            style={detail}
            maxFontSizeMultiplier={1.6}
          >
            {patternsCopy.minutesTotal(patterns.totalMinutes)}
          </EchoText>
        </View>
        <Rule />
        <View style={styles.block}>
          <Label>{patternsCopy.weeksTitle}</Label>
          {patterns.weeks.map((week, index) => (
            <Week key={week.start} week={week} index={index} />
          ))}
        </View>
        <Rule />
        <View style={styles.block}>
          <Label>{patternsCopy.moodTitle}</Label>
          <View style={styles.moods}>
            {MOODS.map((mood) => {
              const count = patterns.moodTotals[mood];
              return (
                <View
                  key={mood}
                  style={[styles.mood, count === 0 && styles.none]}
                  accessible
                  accessibilityLabel={patternsCopy.moodCount(moodLabel(mood), count)}
                >
                  <EchoText variant="bodyM" style={detail} maxFontSizeMultiplier={1.6}>
                    {moodLabel(mood)}
                  </EchoText>
                  <EchoText
                    variant="bodyM"
                    color="textSecondary"
                    style={detail}
                    maxFontSizeMultiplier={1.6}
                  >
                    {String(count)}
                  </EchoText>
                </View>
              );
            })}
          </View>
        </View>
        <Rule />
        <View style={styles.foot}>
          <EchoText
            variant="caption"
            color="textSecondary"
            style={supporting}
            maxFontSizeMultiplier={1.6}
          >
            {keepTogether(patternsCopy.intro)}
          </EchoText>
        </View>
      </Surface>
      {patterns.unreadable > 0 && <Quiet>{patternsCopy.skipped(patterns.unreadable)}</Quiet>}
    </View>
  );
}

/** While the echoes are counted: the shape of the page to come. */
function Counting() {
  return (
    <Loading label={patternsCopy.loading}>
      <Surface radius={tokens.radius.card}>
        <View style={styles.counting}>
          <SkeletonLine width="44%" height={20} />
          <SkeletonLine width="70%" height={11} />
          <SkeletonLine width="58%" height={11} />
        </View>
      </Surface>
    </Loading>
  );
}

/**
 * Opening this page sends nothing anywhere and is never pushed to Home. The pattern cards come first,
 * and read only when asked for, after an agreement. The plain counts sit beneath them.
 */
export function PatternsScreen() {
  const { state, entries, retry } = usePatterns();
  return (
    <TabPage title={patternsCopy.title}>
      {state.kind === 'loading' && <Counting />}
      {state.kind === 'error' && (
        <Notice message={patternsCopy.loadError} onAction={() => void retry()} />
      )}
      {state.kind === 'ready' &&
        (state.patterns.unlocked ? (
          <>
            <PatternCardsSection entries={entries} />
            <Rhythm patterns={state.patterns} />
          </>
        ) : (
          <Locked count={state.patterns.reflections} />
        ))}
    </TabPage>
  );
}

const styles = StyleSheet.create({
  locked: {
    alignItems: 'center',
    gap: tokens.space[12],
    paddingHorizontal: tokens.space[32],
    paddingTop: tokens.space[32],
    paddingBottom: tokens.space[32],
  },
  cairns: { flexDirection: 'row', gap: tokens.space[12], marginBottom: tokens.space[8] },
  rhythm: { gap: tokens.space[12], marginTop: tokens.space[16] },
  total: { gap: tokens.space[4], padding: tokens.space[20], paddingBottom: tokens.space[16] },
  block: { gap: tokens.space[12], paddingHorizontal: tokens.space[20], paddingVertical: 16 },
  label: { fontFamily: 'Inter_500Medium' },
  week: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space[12] },
  weekText: { flex: 1, gap: 2 },
  moods: { flexDirection: 'row', flexWrap: 'wrap', columnGap: tokens.space[20], rowGap: 8 },
  mood: { flexDirection: 'row', gap: tokens.space[8] },
  none: { opacity: 0.55 },
  foot: { paddingHorizontal: tokens.space[20], paddingVertical: tokens.space[12] },
  counting: { gap: tokens.space[16], padding: tokens.space[24] },
});
