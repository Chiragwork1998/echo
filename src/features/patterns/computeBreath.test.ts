import { readFileSync } from 'node:fs';

import {
  loadFeelings,
  recordPractice,
  type Feeling,
  type FeelingCounts,
  type Tally,
} from '@/features/breathe/feelingStore';
import { deviceClock } from '@/features/journal/localDay';
import { installRuntime } from '@/storage/runtime';
import { createTestRuntime } from '@/storage/testing/nodePorts';

import { computeBreath, NAMED_FROM_ANSWERS } from './computeBreath';
import { patternsCopy } from './patternsCopy';

// Thursday 5 November 2026. This week began on Monday the 2nd, and the four weeks Patterns shows
// began on Monday 12 October.
const TODAY = '2026-11-05';

const tally = (patch: Partial<Tally>): Tally => ({
  practices: 0,
  calmer: 0,
  same: 0,
  unsettled: 0,
  ...patch,
});
const counts = (days: FeelingCounts['days']): FeelingCounts => ({ v: 1, days });

/** Records practices as Breathe does: one finished practice, and the answer if one was given. */
async function practise(day: string, id: string, answers: (Feeling | 'skip')[]) {
  for (const answer of answers) {
    const result = await recordPractice(day, id, {
      practice: true,
      feeling: answer === 'skip' ? undefined : answer,
    });
    expect(result.ok).toBe(true);
  }
}

async function sealedCounts() {
  const loaded = await loadFeelings();
  if (!loaded.ok) throw new Error('the sealed counts did not open');
  return loaded.value;
}

describe('the breath line, counted from the sealed store', () => {
  beforeEach(async () => installRuntime(await createTestRuntime()));
  afterEach(() => installRuntime(null));

  it('counts this week’s practices and how many ended calmer, by the person’s local days', async () => {
    // Late on Sunday night is last week, and just after midnight on Monday is this week, on the
    // phone's own calendar wherever it is.
    const lateSunday = deviceClock.localDay(new Date(2026, 10, 1, 23, 50));
    const earlyMonday = deviceClock.localDay(new Date(2026, 10, 2, 0, 10));
    expect([lateSunday, earlyMonday]).toEqual(['2026-11-01', '2026-11-02']);

    await practise(lateSunday, 'settle', ['calmer', 'calmer']);
    await practise(earlyMonday, 'settle', ['calmer', 'same']);
    await practise(TODAY, 'ground', ['calmer', 'unsettled', 'skip']);
    await practise('2026-11-08', 'heart', ['calmer']); // Sunday, the end of this week

    const breath = computeBreath(await sealedCounts(), TODAY);
    expect(breath).toEqual({ practices: 6, calmer: 3, helpsMost: 'Settle' });
    expect(patternsCopy.breathWeek(6, 3)).toBe('6 practices this week. Calmer after 3.');
    expect(patternsCopy.helpsMost('Settle')).toBe('Settle helps you most often.');
  });

  it('says nothing about this week on a Monday before any practice, and keeps the four weeks', async () => {
    await practise('2026-10-28', 'settle', ['calmer', 'calmer', 'same']);
    expect(computeBreath(await sealedCounts(), '2026-11-02')).toEqual({
      practices: 0,
      calmer: 0,
      helpsMost: 'Settle',
    });
  });

  it('counts a skipped check as a practice, but never as calmer or as an answer', async () => {
    await practise(TODAY, 'settle', ['calmer', 'skip', 'skip', 'skip']);
    const breath = computeBreath(await sealedCounts(), TODAY);
    expect(breath).toEqual({ practices: 4, calmer: 1, helpsMost: null });
  });
});

describe('computeBreath', () => {
  it('is null when there are no practices, so no line of zeros is shown', () => {
    expect(computeBreath(counts({}), TODAY)).toBeNull();
    expect(computeBreath(counts({ [TODAY]: {} }), TODAY)).toBeNull();
    expect(computeBreath(counts({ [TODAY]: { settle: tally({}) } }), TODAY)).toBeNull();
  });

  it('leaves out practices from before the four weeks Patterns shows', () => {
    const before = counts({ '2026-10-11': { settle: tally({ practices: 5, calmer: 5 }) } });
    expect(computeBreath(before, TODAY)).toBeNull();
    const first = counts({ '2026-10-12': { settle: tally({ practices: 3, calmer: 3 }) } });
    expect(computeBreath(first, TODAY)?.helpsMost).toBe('Settle');
  });

  it('is null when earlier weeks had practices but none this week names a practice', () => {
    const earlier = counts({
      '2026-10-27': { settle: tally({ practices: 2, calmer: 1, same: 1 }) },
      '2026-10-20': { ground: tally({ practices: 4, calmer: 0, unsettled: 1 }) },
    });
    expect(computeBreath(earlier, TODAY)).toBeNull();
  });

  it(`names a practice only from ${NAMED_FROM_ANSWERS} answers or more`, () => {
    const two = counts({ [TODAY]: { soothe: tally({ practices: 2, calmer: 2 }) } });
    expect(computeBreath(two, TODAY)).toEqual({ practices: 2, calmer: 2, helpsMost: null });

    const three = counts({
      [TODAY]: { soothe: tally({ practices: 2, calmer: 2 }) },
      '2026-10-21': { soothe: tally({ practices: 1, unsettled: 1 }) },
    });
    expect(computeBreath(three, TODAY)?.helpsMost).toBe('Soothe');
  });

  it('names the practice that most often ended calmer, and names none on a tie', () => {
    const settleMost = counts({
      [TODAY]: {
        settle: tally({ practices: 4, calmer: 3, same: 1 }),
        ground: tally({ practices: 3, calmer: 2, unsettled: 1 }),
      },
    });
    expect(computeBreath(settleMost, TODAY)?.helpsMost).toBe('Settle');

    const tied = counts({
      [TODAY]: {
        settle: tally({ practices: 3, calmer: 3 }),
        ground: tally({ practices: 4, calmer: 3, same: 1 }),
      },
    });
    expect(computeBreath(tied, TODAY)?.helpsMost).toBeNull();
  });

  it('names nothing when no practice ever ended calmer', () => {
    const never = counts({ [TODAY]: { cool: tally({ practices: 4, same: 2, unsettled: 2 }) } });
    expect(computeBreath(never, TODAY)).toEqual({ practices: 4, calmer: 0, helpsMost: null });
    expect(patternsCopy.breathWeek(4, 0)).toBe('4 practices this week.');
    expect(patternsCopy.breathWeek(1, 1)).toBe('1 practice this week. Calmer after 1.');
  });

  it('counts a practice it does not know, but never names it, and ignores damaged counts', () => {
    const odd = counts({
      [TODAY]: {
        retired: tally({ practices: 3, calmer: 3 }),
        settle: { practices: 2, calmer: Number.NaN, same: -1, unsettled: 0.5 },
      },
      'not a day': { settle: tally({ practices: 9, calmer: 9 }) },
    });
    expect(computeBreath(odd, TODAY)).toEqual({ practices: 5, calmer: 3, helpsMost: null });
  });
});

describe('where the breath counts go', () => {
  // Read from the sealed store and worked out on the phone. Nothing on the way logs or sends.
  const files = [
    'src/features/breathe/feelingStore.ts',
    'src/features/breathe/feelingStore.web.ts',
    'src/features/patterns/computeBreath.ts',
    'src/features/patterns/usePatterns.ts',
  ];

  it.each(files)('%s never logs and never sends anything', (path) => {
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/\bconsole\s*\./);
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/);
    expect(source).not.toMatch(/@\/services\//);
  });
});
