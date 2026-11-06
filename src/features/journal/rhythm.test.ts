import { addDays, dayDistance, deviceClock, weekdayIndex, type Clock } from './localDay';
import { deriveRhythm, type DayCount } from './rhythm';
import { createSqlJournal } from './sqlJournal';
import { emptyContent } from './content';

import { createTestRuntime } from '@/storage/testing/nodePorts';

/**
 * A device in a real timezone. Jest cannot change the process timezone once running, so this asks
 * Intl, which applies the same IANA rules, DST included, that the device's local getters use.
 */
function clockIn(timeZone: string, moment: () => Date): Clock {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return {
    now: moment,
    localDay: (at) => formatter.format(at),
  };
}

const days = (...list: string[]): DayCount[] => list.map((day) => ({ day, count: 1 }));

describe('calendar arithmetic', () => {
  it('steps across month, year, and leap-day boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days across both DST changes', () => {
    expect(dayDistance('2026-03-07', '2026-03-09')).toBe(2); // Spring forward in the US.
    expect(dayDistance('2026-10-31', '2026-11-02')).toBe(2); // Fall back in the US.
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0); // Monday
    expect(weekdayIndex('2026-11-08')).toBe(6); // Sunday
  });

  it('deviceClock reports the wall clock of the device', () => {
    const at = new Date(2026, 10, 6, 23, 59);
    expect(deviceClock.localDay(at)).toBe('2026-11-06');
  });
});

describe('deriveRhythm', () => {
  it('lays out Monday to Sunday of the current week', () => {
    const { week } = deriveRhythm(days('2026-11-02', '2026-11-05'), '2026-11-05');
    expect(week.map((item) => item.weekday)).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
      'sat',
      'sun',
    ]);
    expect(week.map((item) => item.day)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(week.filter((item) => item.completed).map((item) => item.weekday)).toEqual([
      'mon',
      'thu',
    ]);
    expect(week.filter((item) => item.isToday).map((item) => item.weekday)).toEqual(['thu']);
  });

  it('is empty, not broken, with no entries', () => {
    const rhythm = deriveRhythm([], '2026-11-05');
    expect(rhythm.currentStreak).toBe(0);
    expect(rhythm.totalDays).toBe(0);
    expect(rhythm.week).toHaveLength(7);
    expect(rhythm.week.some((item) => item.completed)).toBe(false);
  });

  it('counts a day once for the streak but every entry as a reflection', () => {
    const rhythm = deriveRhythm(
      [
        { day: '2026-11-04', count: 3 },
        { day: '2026-11-05', count: 2 },
      ],
      '2026-11-05',
    );
    expect(rhythm.currentStreak).toBe(2);
    expect(rhythm.totalDays).toBe(2);
    expect(rhythm.totalReflections).toBe(5);
    expect(rhythm.weekReflections).toBe(5);
  });

  it('keeps the streak alive until today is over', () => {
    const rows = days('2026-11-03', '2026-11-04');
    expect(deriveRhythm(rows, '2026-11-05').currentStreak).toBe(2);
    expect(deriveRhythm(rows, '2026-11-06').currentStreak).toBe(0);
  });

  it('stops at the first gap', () => {
    const rows = days('2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05');
    expect(deriveRhythm(rows, '2026-11-05').currentStreak).toBe(2);
  });

  it('runs a streak across a month and year boundary', () => {
    const rows = days('2026-12-30', '2026-12-31', '2027-01-01');
    expect(deriveRhythm(rows, '2027-01-01').currentStreak).toBe(3);
  });

  it('ignores a corrupted day rather than failing', () => {
    const rhythm = deriveRhythm(
      [...days('2026-11-05'), { day: 'not-a-day', count: 1 }],
      '2026-11-05',
    );
    expect(rhythm.totalDays).toBe(1);
  });

  it('does not break a streak when today is earlier than the last entry', () => {
    // Written in Tokyo on the 6th, then flew to Los Angeles, where it is still the 5th.
    const rows = days('2026-11-04', '2026-11-05', '2026-11-06');
    expect(deriveRhythm(rows, '2026-11-05').currentStreak).toBe(3);
  });
});

describe('rhythm from committed entries', () => {
  let moment = new Date();
  const now = () => moment;

  async function journalIn(
    timeZone: string,
    runtime?: Awaited<ReturnType<typeof createTestRuntime>>,
  ) {
    const rt = runtime ?? (await createTestRuntime());
    return { rt, journal: createSqlJournal(rt, clockIn(timeZone, now)) };
  }

  async function commitAt(
    journal: ReturnType<typeof createSqlJournal>,
    id: string,
    instant: string,
  ) {
    moment = new Date(instant);
    const result = await journal.commitEntry(id, emptyContent({ body: 'a day was here' }));
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }

  async function rhythmAt(journal: ReturnType<typeof createSqlJournal>, instant: string) {
    moment = new Date(instant);
    const result = await journal.getRhythm();
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }

  it('records the day on the wall clock, not in UTC', async () => {
    const { journal } = await journalIn('America/New_York');
    // 11:30 PM on the 6th in New York is already the 7th in UTC.
    const entry = await commitAt(journal, 'late', '2026-11-07T04:30:00Z');
    expect(entry.localDay).toBe('2026-11-06');
  });

  it('keeps the streak through spring forward, a 23-hour day', async () => {
    const { journal } = await journalIn('America/New_York');
    await commitAt(journal, 'sat', '2026-03-08T04:30:00Z'); // Sat 7th, 11:30 PM EST
    await commitAt(journal, 'sun', '2026-03-09T03:30:00Z'); // Sun 8th, 11:30 PM EDT
    await commitAt(journal, 'mon', '2026-03-10T03:30:00Z'); // Mon 9th, 11:30 PM EDT

    const rhythm = await rhythmAt(journal, '2026-03-10T14:00:00Z');
    expect(rhythm.today).toBe('2026-03-10');
    expect(rhythm.currentStreak).toBe(3);
    expect(rhythm.totalDays).toBe(3);
  });

  it('keeps the streak through fall back, a 25-hour day', async () => {
    const { journal } = await journalIn('America/New_York');
    await commitAt(journal, 'sat', '2026-11-01T03:30:00Z'); // Sat 31st, 11:30 PM EDT
    await commitAt(journal, 'early', '2026-11-01T04:10:00Z'); // Sun 1st, 12:10 AM EDT
    await commitAt(journal, 'late', '2026-11-02T04:50:00Z'); // Sun 1st, 11:50 PM EST

    const rhythm = await rhythmAt(journal, '2026-11-02T14:00:00Z');
    expect(rhythm.currentStreak).toBe(2);
    expect(rhythm.totalDays).toBe(2);
    expect(rhythm.totalReflections).toBe(3);
  });

  it('does not count one 25-hour Sunday twice', async () => {
    const { journal } = await journalIn('America/New_York');
    await commitAt(journal, 'a', '2026-11-01T04:30:00Z'); // 12:30 AM on Sunday
    await commitAt(journal, 'b', '2026-11-02T04:30:00Z'); // 11:30 PM on the same Sunday
    expect((await rhythmAt(journal, '2026-11-02T14:00:00Z')).totalDays).toBe(1);
  });

  it('leaves past days alone when the user changes timezone', async () => {
    const { rt, journal } = await journalIn('America/New_York');
    await commitAt(journal, 'mon', '2026-11-03T04:30:00Z'); // Mon 2nd, 11:30 PM EST
    await commitAt(journal, 'tue', '2026-11-04T04:30:00Z'); // Tue 3rd, 11:30 PM EST

    // Same database, now read from Tokyo, where those instants fall on the 3rd and the 4th.
    const { journal: abroad } = await journalIn('Asia/Tokyo', rt);
    const rhythm = await rhythmAt(abroad, '2026-11-04T03:00:00Z'); // Wed 4th, noon in Tokyo
    const completed = rhythm.week.filter((item) => item.completed).map((item) => item.day);
    expect(completed).toEqual(['2026-11-02', '2026-11-03']);
    expect(rhythm.currentStreak).toBe(2);
  });

  it('keeps a streak going through a flight east over the date line', async () => {
    const { rt, journal } = await journalIn('Asia/Tokyo');
    await commitAt(journal, 'first', '2026-11-05T12:00:00Z'); // Thu 5th, 9 PM in Tokyo

    const { journal: abroad } = await journalIn('America/Los_Angeles', rt);
    // Same evening, an hour later by the sun, and the calendar has gone backwards a day.
    const rhythm = await rhythmAt(abroad, '2026-11-05T13:00:00Z'); // Thu 5th, 5 AM in LA
    expect(rhythm.currentStreak).toBe(1);
    await commitAt(abroad, 'second', '2026-11-06T04:00:00Z'); // Thu 5th, 8 PM in LA
    expect((await rhythmAt(abroad, '2026-11-06T17:00:00Z')).totalDays).toBe(1);
  });

  it('reflects deletion immediately, because nothing is stored', async () => {
    const { journal } = await journalIn('UTC');
    await commitAt(journal, 'a', '2026-11-04T10:00:00Z');
    await commitAt(journal, 'b', '2026-11-05T10:00:00Z');
    expect((await rhythmAt(journal, '2026-11-05T12:00:00Z')).currentStreak).toBe(2);

    await journal.deleteEntry('a');
    const rhythm = await rhythmAt(journal, '2026-11-05T12:00:00Z');
    expect(rhythm.currentStreak).toBe(1);
    expect(rhythm.totalDays).toBe(1);
  });

  it('ignores drafts', async () => {
    const { journal } = await journalIn('UTC');
    await journal.saveDraft('draft', emptyContent({ body: 'unfinished' }));
    const rhythm = await rhythmAt(journal, '2026-11-05T12:00:00Z');
    expect(rhythm.currentStreak).toBe(0);
    expect(rhythm.totalDays).toBe(0);
  });
});
