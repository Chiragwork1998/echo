import {
  arrivalFor,
  countsOf,
  heldRhythm,
  isWelcome,
  useStoneMemory,
  WELCOME_WINDOW_MS,
  welcomeCandidate,
  type StoneCounts,
} from './stoneMemory';

import type { Rhythm } from '@/features/journal';

const counts = (patch: Partial<StoneCounts> = {}): StoneCounts => ({
  day: '2026-11-05',
  todayDone: false,
  total: 0,
  streak: 0,
  done: 0,
  ...patch,
});

const rhythm = (patch: Partial<Rhythm> = {}, doneUntil = 3): Rhythm => ({
  today: '2026-11-05',
  week: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((weekday, i) => ({
    day: `2026-11-0${2 + i}`,
    weekday: weekday as Rhythm['week'][number]['weekday'],
    completed: i <= doneUntil,
    isToday: i === 3,
  })),
  weekReflections: 4,
  currentStreak: 4,
  totalDays: 4,
  totalReflections: 4,
  ...patch,
});

describe('arrivalFor', () => {
  it('seeds silently on the first summary of a run', () => {
    expect(arrivalFor(null, counts({ todayDone: true, total: 2 }))).toBe('none');
  });

  it('sets a stone when today flips from open to done while the app is running', () => {
    const before = counts({ total: 3 });
    expect(arrivalFor(before, counts({ todayDone: true, total: 4 }))).toBe('set');
  });

  it('changes only the digits for a second echo the same day', () => {
    const before = counts({ todayDone: true, total: 4 });
    expect(arrivalFor(before, counts({ todayDone: true, total: 5 }))).toBe('digits');
  });

  it('says nothing when nothing rose', () => {
    const same = counts({ todayDone: true, total: 4 });
    expect(arrivalFor(same, same)).toBe('none');
    expect(arrivalFor(same, counts({ todayDone: true, total: 3 }))).toBe('none');
    expect(arrivalFor(counts({ total: 3 }), counts({ total: 3 }))).toBe('none');
  });

  it('reseeds quietly on a new local day', () => {
    const yesterday = counts({ day: '2026-11-04', todayDone: false, total: 2 });
    expect(arrivalFor(yesterday, counts({ day: '2026-11-05', todayDone: true, total: 4 }))).toBe(
      'none',
    );
  });

  it('does not play again when today is deleted and written again', () => {
    const open = counts({ total: 3 });
    const done = counts({ todayDone: true, total: 4 });
    expect(arrivalFor(open, done, { playedDay: done.day })).toBe('none');
    expect(arrivalFor(open, done, { playedDay: '2026-11-04' })).toBe('set');
  });

  it('plays the welcome only on the first summary, and only when it is the welcome', () => {
    const first = counts({ todayDone: true, total: 1, streak: 1, done: 1 });
    expect(arrivalFor(null, first, { welcome: true })).toBe('first');
    expect(arrivalFor(null, first, { welcome: false })).toBe('none');
    // A summary the app has already seen is never the first.
    expect(arrivalFor(counts(), first, { welcome: true })).toBe('set');
  });
});

describe('the welcome', () => {
  const NOW = 1_800_000_000_000;
  const base = {
    welcomed: false,
    totalDays: 1,
    todayDone: true,
    completedAt: NOW - 60_000,
    now: NOW,
  };

  it('needs a Home that has not welcomed, one day, today done, and onboarding just finished', () => {
    expect(isWelcome(base)).toBe(true);
    expect(isWelcome({ ...base, welcomed: true })).toBe(false);
    expect(isWelcome({ ...base, totalDays: 2 })).toBe(false);
    expect(isWelcome({ ...base, totalDays: 0 })).toBe(false);
    expect(isWelcome({ ...base, todayDone: false })).toBe(false);
    expect(isWelcome({ ...base, completedAt: undefined })).toBe(false);
  });

  it('is not the welcome for someone who updated, or restored a copy from another phone', () => {
    expect(isWelcome({ ...base, completedAt: NOW - WELCOME_WINDOW_MS - 1 })).toBe(false);
    expect(isWelcome({ ...base, completedAt: NOW - WELCOME_WINDOW_MS })).toBe(true);
    // A record dated in the future is not a recent one.
    expect(isWelcome({ ...base, completedAt: NOW + 60_000 })).toBe(false);
  });

  it('can be a candidate before the journal has answered, from the flag and the date alone', () => {
    expect(welcomeCandidate({ welcomed: false, completedAt: NOW - 1000, now: NOW })).toBe(true);
    expect(welcomeCandidate({ welcomed: true, completedAt: NOW - 1000, now: NOW })).toBe(false);
    expect(welcomeCandidate({ welcomed: false, completedAt: undefined, now: NOW })).toBe(false);
    expect(
      welcomeCandidate({ welcomed: false, completedAt: NOW - WELCOME_WINDOW_MS - 1, now: NOW }),
    ).toBe(false);
  });
});

describe('what Home counts', () => {
  it('reads only counts and a day from the rhythm', () => {
    expect(countsOf(rhythm())).toEqual({
      day: '2026-11-05',
      todayDone: true,
      total: 4,
      streak: 4,
      done: 4,
    });
    expect(countsOf(rhythm({}, 2))).toMatchObject({ todayDone: false, done: 3 });
  });

  it('holds Home as it was: today still open, the count and streak as they were', () => {
    const before = counts({ day: '2026-11-05', todayDone: false, total: 3, streak: 3, done: 3 });
    const held = heldRhythm(rhythm(), before);
    expect(held.week.find((day) => day.isToday)?.completed).toBe(false);
    expect(held.week.filter((day) => day.completed)).toHaveLength(3);
    expect(held.weekReflections).toBe(3);
    expect(held.currentStreak).toBe(3);
  });

  it('holds a second echo at the old count and leaves the cairns as they are', () => {
    const before = counts({ todayDone: true, total: 3, streak: 4, done: 4 });
    const held = heldRhythm(rhythm(), before);
    expect(held.week.filter((day) => day.completed)).toHaveLength(4);
    expect(held.weekReflections).toBe(3);
  });
});

describe('the memory of an app run', () => {
  beforeEach(() => useStoneMemory.getState().reset());

  const open = counts({ total: 3, streak: 3, done: 3 });
  const done = counts({ todayDone: true, total: 4, streak: 4, done: 4 });

  it('seeds on the first summary and plays nothing', () => {
    expect(useStoneMemory.getState().observe(done, false)).toBeNull();
    expect(useStoneMemory.getState().pending).toBeNull();
  });

  it('marks a stone to be set when today flips, and remembers what was seen before', () => {
    const memory = useStoneMemory.getState();
    memory.observe(open, false);
    expect(memory.observe(done, false)).toEqual({ kind: 'set', before: open, after: done });
    expect(useStoneMemory.getState().pending).toEqual({ kind: 'set', before: open, after: done });
  });

  it('asks again with the same answer when the same summary arrives twice', () => {
    const memory = useStoneMemory.getState();
    memory.observe(open, false);
    const first = memory.observe(done, false);
    expect(memory.observe(done, false)).toEqual(first);
  });

  it('settles on finish: the stone is not set again, and the counts are the new ones', () => {
    const memory = useStoneMemory.getState();
    memory.observe(open, false);
    memory.observe(done, false);
    memory.finish();
    expect(useStoneMemory.getState().pending).toBeNull();
    expect(memory.observe(done, false)).toBeNull();
    // A second echo the same day is digits only.
    const second = counts({ todayDone: true, total: 5, streak: 4, done: 4 });
    expect(memory.observe(second, false)).toEqual({ kind: 'digits', before: done, after: second });
  });

  it('does not replay a deleted and rewritten day', () => {
    const memory = useStoneMemory.getState();
    memory.observe(open, false);
    memory.observe(done, false);
    memory.finish();
    expect(memory.observe(open, false)).toBeNull();
    expect(memory.observe(done, false)).toBeNull();
  });

  it('forgets a stone that is no longer true', () => {
    const memory = useStoneMemory.getState();
    memory.observe(open, false);
    memory.observe(done, false);
    expect(memory.observe(open, false)).toBeNull();
    expect(useStoneMemory.getState().pending).toBeNull();
  });

  it('drops a pending stone at midnight and reseeds on the new day', () => {
    const memory = useStoneMemory.getState();
    memory.observe(open, false);
    memory.observe(done, false);
    expect(memory.observe(counts({ day: '2026-11-06' }), false)).toBeNull();
    expect(useStoneMemory.getState().pending).toBeNull();
  });

  it('plays the welcome on the first summary, with an empty day as where it comes from', () => {
    const first = counts({ todayDone: true, total: 1, streak: 1, done: 1 });
    const pending = useStoneMemory.getState().observe(first, true);
    expect(pending?.kind).toBe('first');
    expect(pending?.before).toEqual(counts({ total: 0, streak: 0, done: 0, todayDone: false }));
    useStoneMemory.getState().finish();
    // It never plays twice in a run.
    expect(useStoneMemory.getState().observe(first, true)).toBeNull();
  });

  it('keeps only counts and a day string', () => {
    const memory = useStoneMemory.getState();
    memory.observe(open, false);
    memory.observe(done, false);
    const text = JSON.stringify(useStoneMemory.getState().pending);
    expect(text).not.toMatch(/body|title|text|name|word/i);
  });
});
