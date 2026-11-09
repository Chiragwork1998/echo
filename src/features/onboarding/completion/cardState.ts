import type { ReflectionOutcome } from '@/services/reflection';

export type ReflectionCardState = 'loading' | 'success' | 'offline' | 'support' | 'error';
/**
 * `ask`: the saved card offers the reading agreement, its one quiet action, because there is none
 * and today's echo waits on it.
 */
export type CardView = { state: ReflectionCardState; text?: string; ask?: boolean };

type Input = {
  /** The newest saved entry, from useLatestEntry. */
  entry: { status: 'loading' | 'ready' | 'error'; found: boolean };
  outcome: ReflectionOutcome;
  /** Pending has lasted long enough to be worth showing. See useGrace. */
  waited: boolean;
};

/**
 * Which card to draw. The reflection is never required: offline is the ordinary, finished state,
 * and a reflection that is still on its way waits quietly until it has taken long enough to name.
 * Support is never a reflection: the card offers a way to someone instead.
 */
export function cardView({ entry, outcome, waited }: Input): CardView {
  // The entry was committed before this screen appeared, so "saved" holds even if it cannot be read.
  if (entry.status === 'error' && !entry.found) return { state: 'error' };
  if (entry.status === 'loading' || !entry.found) return { state: 'offline' };
  switch (outcome.status) {
    case 'complete':
      return { state: 'success', text: outcome.text };
    case 'support':
      return { state: 'support' };
    case 'error':
      return { state: 'error' };
    case 'pending':
      return { state: waited ? 'loading' : 'offline' };
    case 'unagreed':
      return { state: 'offline', ask: true };
    default:
      return { state: 'offline' };
  }
}
