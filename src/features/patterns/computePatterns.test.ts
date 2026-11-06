import type { EntrySummary } from '@/features/journal';

import { computePatterns, PATTERNS_MIN } from './computePatterns';

// Thursday 5 November 2026. This week began on Monday the 2nd.
const TODAY = '2026-11-05';

const entry = (day: string, patch: Partial<EntrySummary> = {}): EntrySummary => ({
  id: `${day}-${Math.random()}`,
  status: 'committed',
  readable: true,
  title: 'x',
  preview: 'x',
  mode: 'text',
  durationSeconds: 60,
  hasAudio: false,
  recovered: false,
  createdAt: 0,
  updatedAt: 0,
  localDay: day,
  ...patch,
});

describe('computePatterns', () => {
  it('stays locked below five committed echoes and unlocks at five', () => {
    const four = Array.from({ length: PATTERNS_MIN - 1 }, () => entry(TODAY));
    expect(computePatterns(four, TODAY).unlocked).toBe(false);
    expect(computePatterns([...four, entry(TODAY)], TODAY).unlocked).toBe(true);
  });

  it('counts this week from Monday to Sunday by each echo’s own day', () => {
    const patterns = computePatterns(
      [entry('2026-11-02'), entry('2026-11-05'), entry('2026-11-01'), entry('2026-10-26')],
      TODAY,
    );
    expect(patterns.thisWeek).toBe(2);
    expect(patterns.weeks.map((week) => week.reflections)).toEqual([2, 2, 0, 0]);
    expect(patterns.weeks[0]?.start).toBe('2026-11-02');
  });

  it('sums minutes from durations and counts moods overall and by week', () => {
    const patterns = computePatterns(
      [
        entry('2026-11-05', { durationSeconds: 360, moodBefore: 'light' }),
        entry('2026-11-04', { durationSeconds: 420, moodBefore: 'light' }),
        entry('2026-10-28', { durationSeconds: 60, moodBefore: 'heavy' }),
        entry('2026-10-27'),
      ],
      TODAY,
    );
    expect(patterns.totalMinutes).toBe(15);
    expect(patterns.moodTotals).toEqual({ light: 2, steady: 0, unsettled: 0, heavy: 1, numb: 0 });
    expect(patterns.weeks[0]?.moods.light).toBe(2);
    expect(patterns.weeks[1]?.moods.heavy).toBe(1);
    expect(patterns.weeks[1]?.noMood).toBe(1);
  });

  it('counts an echo that cannot be opened as committed but leaves it out of every figure', () => {
    const patterns = computePatterns(
      [entry(TODAY), entry(TODAY, { readable: false, durationSeconds: 0 })],
      TODAY,
    );
    expect(patterns.reflections).toBe(2);
    expect(patterns.unreadable).toBe(1);
    expect(patterns.thisWeek).toBe(1);
  });

  it('counts a mood it does not know as none, never as NaN', () => {
    const patterns = computePatterns(
      [entry(TODAY, { moodBefore: 'radiant' as unknown as 'light' })],
      TODAY,
    );
    expect(Object.values(patterns.moodTotals).every((count) => count === 0)).toBe(true);
    expect(patterns.weeks[0]?.noMood).toBe(1);
  });
});
