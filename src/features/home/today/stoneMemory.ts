import { create } from 'zustand';

import type { Rhythm } from '@/features/journal';

/**
 * What Home remembers, for one run of the app, so that a stone is set when it is true and never
 * otherwise. It holds counts and a day string and nothing a person wrote. It is not saved: a cold
 * start has seen nothing happen, so it seeds from the first summary and plays nothing.
 */

/** Onboarding must have finished this recently for Home's first look to be a welcome. */
export const WELCOME_WINDOW_MS = 10 * 60 * 1000;

export type StoneCounts = {
  /** The local day, 'YYYY-MM-DD'. */
  day: string;
  todayDone: boolean;
  /** Reflections this week: the number the Night count line says. */
  total: number;
  /** Consecutive days: the Day rhythm line. */
  streak: number;
  /** Days this week that are built: how many pebbles Day shows. */
  done: number;
};

export type Arrival = 'none' | 'set' | 'digits' | 'first';
export type Pending = {
  kind: Exclude<Arrival, 'none'>;
  /** What the person last saw on Home: where the arrival comes from. */
  before: StoneCounts;
  /** What is true now: where it comes to rest. */
  after: StoneCounts;
};

export function countsOf(rhythm: Rhythm): StoneCounts {
  return {
    day: rhythm.today,
    todayDone: rhythm.week.find((day) => day.isToday)?.completed ?? false,
    total: rhythm.weekReflections,
    streak: rhythm.currentStreak,
    done: rhythm.week.filter((day) => day.completed).length,
  };
}

/** Home as the person last saw it: today's cairn as it was, the count and the streak as they were. */
export function heldRhythm(rhythm: Rhythm, before: StoneCounts): Rhythm {
  return {
    ...rhythm,
    week: rhythm.week.map((day) => (day.isToday ? { ...day, completed: before.todayDone } : day)),
    weekReflections: before.total,
    currentStreak: before.streak,
  };
}

/**
 * Whether the summary just seen is a change worth marking. `prev` is what Home last showed settled.
 * Only a flip seen while the app was running counts, so a restore, an import or a backfilled entry
 * (all of which arrive before Home has seen today open) never plays.
 */
export function arrivalFor(
  prev: StoneCounts | null,
  next: StoneCounts,
  { playedDay = null, welcome = false }: { playedDay?: string | null; welcome?: boolean } = {},
): Arrival {
  if (!prev) return welcome ? 'first' : 'none';
  if (prev.day !== next.day) return 'none';
  if (!prev.todayDone && next.todayDone) return playedDay === next.day ? 'none' : 'set';
  if (prev.todayDone && next.todayDone && next.total > prev.total) return 'digits';
  return 'none';
}

const recently = (completedAt: number | undefined, now: number) =>
  completedAt !== undefined && now - completedAt >= 0 && now - completedAt <= WELCOME_WINDOW_MS;

/** Known the moment Home mounts, before the journal has answered: enough to wake the loop slowly. */
export function welcomeCandidate({
  welcomed,
  completedAt,
  now,
}: {
  welcomed: boolean;
  completedAt: number | undefined;
  now: number;
}): boolean {
  return !welcomed && recently(completedAt, now);
}

/** The welcome: Home's first look, on the day of the first echo, just after onboarding. */
export function isWelcome({
  welcomed,
  totalDays,
  todayDone,
  completedAt,
  now,
}: {
  welcomed: boolean;
  totalDays: number;
  todayDone: boolean;
  completedAt: number | undefined;
  now: number;
}): boolean {
  return welcomeCandidate({ welcomed, completedAt, now }) && totalDays === 1 && todayDone;
}

type Memory = {
  /** What Home last showed settled. Null until the first summary of the run. */
  shown: StoneCounts | null;
  /** The last day a stone was set, so deleting today and writing again does not replay it. */
  playedDay: string | null;
  pending: Pending | null;
};

const same = (a: StoneCounts, b: StoneCounts) =>
  a.day === b.day &&
  a.todayDone === b.todayDone &&
  a.total === b.total &&
  a.streak === b.streak &&
  a.done === b.done;

/**
 * What the memory becomes when it sees a summary. Pure, so that Home can know what to draw in the
 * very render the summary arrives in (a built cairn must never show for a frame before it is set),
 * and commit the same answer afterwards.
 */
export function plan(
  memory: Memory,
  next: StoneCounts,
  welcome: boolean,
): Pick<Memory, 'shown' | 'pending'> {
  const { shown, playedDay, pending } = memory;
  const kind = arrivalFor(shown, next, { playedDay, welcome });
  if (kind === 'none') return { shown: next, pending: null };
  const before = shown ?? { ...next, todayDone: false, total: 0, streak: 0, done: 0 };
  // The same answer to the same summary keeps the same object, so nothing re-renders for it.
  if (pending?.kind === kind && same(pending.before, before) && same(pending.after, next)) {
    return { shown, pending };
  }
  return { shown, pending: { kind, before, after: next } };
}

type Store = Memory & {
  /** Takes a summary. Returns what, if anything, is waiting to be played. */
  observe: (next: StoneCounts, welcome: boolean) => Pending | null;
  /** The arrival has been played: what was true is now what is shown. */
  finish: () => void;
  reset: () => void;
};

export const useStoneMemory = create<Store>((set, get) => ({
  shown: null,
  playedDay: null,
  pending: null,
  observe: (next, welcome) => {
    const planned = plan(get(), next, welcome);
    if (planned.shown !== get().shown || planned.pending !== get().pending) set(planned);
    return planned.pending;
  },
  finish: () => {
    const { pending, playedDay } = get();
    if (!pending) return;
    set({
      shown: pending.after,
      playedDay: pending.kind === 'digits' ? playedDay : pending.after.day,
      pending: null,
    });
  },
  reset: () => set({ shown: null, playedDay: null, pending: null }),
}));
