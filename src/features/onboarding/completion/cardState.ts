import type { ReflectionOutcome } from '@/services/reflection';

export type ReflectionCardState = 'loading' | 'success' | 'offline' | 'error';
export type CardView = { state: ReflectionCardState; text?: string };

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
 */
export function cardView({ entry, outcome, waited }: Input): CardView {
  // The entry was committed before this screen appeared, so "saved" holds even if it cannot be read.
  if (entry.status === 'error' && !entry.found) return { state: 'error' };
  if (entry.status === 'loading' || !entry.found) return { state: 'offline' };
  switch (outcome.status) {
    case 'complete':
      return { state: 'success', text: outcome.text };
    case 'error':
      return { state: 'error' };
    case 'pending':
      return { state: waited ? 'loading' : 'offline' };
    default:
      return { state: 'offline' };
  }
}
