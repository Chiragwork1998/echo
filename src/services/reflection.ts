import { getReflection, saveReflection } from '@/features/journal/api';

// The provider decision is open (docs/DECISIONS_REQUIRED.md). This file defines the seam and ships
// one implementation that does nothing, which is what the app must do until there is explicit
// consent and a disclosed provider. Nothing here touches the network.

export type ReflectionOutcome =
  | { status: 'complete'; text: string }
  | { status: 'pending' }
  /** No provider is available. Show the private saved-entry success card. */
  | { status: 'offline' }
  /** “Your words are saved. The reflection can wait.” Offer Try again / Continue. */
  | { status: 'error' };

/**
 * Takes an id rather than text on purpose: a future provider must load and decrypt content itself,
 * behind its own consent check, so plaintext cannot reach a provider by being passed in by default.
 */
export type ReflectionRequest = { entryId: string };

export interface ReflectionProvider {
  reflect(request: ReflectionRequest): Promise<ReflectionOutcome>;
}

export const offlineProvider: ReflectionProvider = {
  reflect: async () => ({ status: 'offline' }),
};

/**
 * Safe to call after any commit. Never throws and never writes to the entry, so saving a journal
 * entry cannot depend on it. The entry is durable before this is ever called.
 */
export async function requestReflection(
  entryId: string,
  provider: ReflectionProvider = offlineProvider,
): Promise<ReflectionOutcome> {
  try {
    const stored = await getReflection(entryId);
    if (stored.ok && stored.value?.status === 'complete' && stored.value.text) {
      return { status: 'complete', text: stored.value.text };
    }
    const outcome = await provider.reflect({ entryId });
    if (outcome.status === 'complete') await saveReflection(entryId, outcome);
    return outcome;
  } catch {
    return { status: 'error' };
  }
}
