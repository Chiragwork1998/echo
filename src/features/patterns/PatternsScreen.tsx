import { EchoText } from '@/components/EchoText';
import { dateLabel, MOODS, moodLabel } from '@/features/echoes/entryFacts';
import { Notice, OnPlate, Quiet, Row, Section } from '@/features/tab-pages/parts';
import { TabPage } from '@/features/tab-pages/TabPage';
import { onPlate } from '@/features/tab-pages/textStyles';

import type { MoodCounts, Patterns, WeekCounts } from './computePatterns';
import { PatternCardsSection } from './PatternCardsSection';
import { patternsCopy } from './patternsCopy';
import { usePatterns } from './usePatterns';

function weekLabel(week: WeekCounts, index: number) {
  if (index === 0) return patternsCopy.thisWeek;
  if (index === 1) return patternsCopy.lastWeek;
  return patternsCopy.weekOf(dateLabel(week.start));
}

/** "Light 2 · Steady 1", only the moods that were chosen that week. */
function moodLine(counts: MoodCounts, noMood: number) {
  const parts = MOODS.filter((mood) => counts[mood] > 0).map((mood) =>
    patternsCopy.moodCount(moodLabel(mood), counts[mood]),
  );
  return parts.length > 0 ? parts.join(' · ') : noMood > 0 ? patternsCopy.noMood : '';
}

function Count({ value }: { value: number }) {
  return <EchoText variant="bodyM">{value}</EchoText>;
}

function Facts({ patterns }: { patterns: Patterns }) {
  return (
    <>
      <OnPlate>
        <EchoText variant="bodyM" color="textSecondary" style={onPlate}>
          {patternsCopy.intro}
        </EchoText>
      </OnPlate>
      <Section title={patternsCopy.weekTitle}>
        <Row label={patternsCopy.reflections(patterns.thisWeek)} />
      </Section>
      <Section title={patternsCopy.totalTitle}>
        <Row label={patternsCopy.reflections(patterns.reflections)} />
        <Row label={patternsCopy.minutesTotal(patterns.totalMinutes)} />
      </Section>
      <Section title={patternsCopy.moodTitle}>
        {MOODS.map((mood) => (
          <Row
            key={mood}
            label={moodLabel(mood)}
            spoken={patternsCopy.moodCount(moodLabel(mood), patterns.moodTotals[mood])}
            trailing={<Count value={patterns.moodTotals[mood]} />}
          />
        ))}
      </Section>
      <Section title={patternsCopy.weeksTitle}>
        {patterns.weeks.map((week, index) => (
          <Row
            key={week.start}
            label={weekLabel(week, index)}
            detail={[patternsCopy.reflections(week.reflections), moodLine(week.moods, week.noMood)]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </Section>
      {patterns.unreadable > 0 && <Quiet>{patternsCopy.skipped(patterns.unreadable)}</Quiet>}
    </>
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
      {state.kind === 'loading' && <Quiet busy>{patternsCopy.loading}</Quiet>}
      {state.kind === 'error' && (
        <Notice message={patternsCopy.loadError} onAction={() => void retry()} />
      )}
      {state.kind === 'ready' &&
        (state.patterns.unlocked ? (
          <>
            <PatternCardsSection entries={entries} />
            <Facts patterns={state.patterns} />
          </>
        ) : (
          <Quiet>{patternsCopy.locked}</Quiet>
        ))}
    </TabPage>
  );
}
