import type { FeelingCounts } from '@/features/breathe/feelingStore';
import { ARRIVE, PRACTICES } from '@/features/breathe/library/practices';
import { addDays, weekdayIndex } from '@/features/journal';
import { isLocalDay } from '@/features/journal/localDay';

import { WEEKS_SHOWN } from './computePatterns';

/** A practice is named only from this many answers, so that it is never a claim from one or two. */
export const NAMED_FROM_ANSWERS = 3;

export type BreathCounts = {
  /** Practices finished this week. One whose check was skipped still counts. */
  practices: number;
  /** How many of this week's practices the person said left them calmer. */
  calmer: number;
  /** The practice that most often left them calmer over the weeks Patterns shows, or null. */
  helpsMost: string | null;
};

const NAMES = new Map([...PRACTICES, ARRIVE].map(({ id, name }) => [id, name]));

/** A stored count, or 0 for anything that is not a whole number above zero. */
const whole = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;

/**
 * Counts and nothing more, from the sealed tallies on this phone: how many practices this week, how
 * many of them ended calmer, and which practice most often did over the four weeks the ledger
 * shows. Weeks run Monday to Sunday by the local day a practice was finished, as the echoes' do.
 *
 * A practice is named only when it alone has the most answers of Calmer, and has been answered at
 * least NAMED_FROM_ANSWERS times. A skipped check is a practice, but never an answer. Null when
 * there is nothing to say, so that a line of zeros is never shown.
 */
export function computeBreath(counts: FeelingCounts, today: string): BreathCounts | null {
  const monday = addDays(today, -weekdayIndex(today));
  const sunday = addDays(monday, 6);
  const first = addDays(monday, -7 * (WEEKS_SHOWN - 1));
  let practices = 0;
  let calmer = 0;
  const answered = new Map<string, { calmer: number; answers: number }>();

  for (const [day, byPractice] of Object.entries(counts.days)) {
    if (!isLocalDay(day) || day < first || day > sunday) continue;
    for (const [id, tally] of Object.entries(byPractice ?? {})) {
      const calmerAfter = whole(tally?.calmer);
      if (day >= monday) {
        practices += whole(tally?.practices);
        calmer += calmerAfter;
      }
      const answers = calmerAfter + whole(tally?.same) + whole(tally?.unsettled);
      const sum = answered.get(id) ?? { calmer: 0, answers: 0 };
      answered.set(id, { calmer: sum.calmer + calmerAfter, answers: sum.answers + answers });
    }
  }

  let most: { id: string; calmer: number; answers: number } | null = null;
  let tied = false;
  for (const [id, sum] of answered) {
    if (!most || sum.calmer > most.calmer) {
      most = { id, ...sum };
      tied = false;
    } else if (sum.calmer === most.calmer) {
      tied = true;
    }
  }
  const helpsMost =
    most && !tied && most.calmer > 0 && most.answers >= NAMED_FROM_ANSWERS
      ? (NAMES.get(most.id) ?? null)
      : null;

  if (practices === 0 && !helpsMost) return null;
  return { practices, calmer, helpsMost };
}
