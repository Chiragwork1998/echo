import { getEntry, getReflection, saveReflection } from '@/features/journal/api';
import type { Entry, JournalResult } from '@/features/journal/types';
import { readingAgreed, usePreferences } from '@/state/preferences';

import { reflectText, type ReflectAnswer } from './readingApi';
import { voiceApi } from './voiceApi';

// Today's echo: a line or two reflecting one entry back to the person (the contract D-017). This file
// is the seam Completion asks through, and the provider behind it, which reads the entry on ECHO's
// server only under the person's reading agreement. Nothing here logs: the entry and its echo are the
// person's own words.

export type ReflectionOutcome =
  | { status: 'complete'; text: string }
  | { status: 'pending' }
  /** No provider can answer, or none should be asked. Show the private saved-entry card. */
  | { status: 'offline' }
  /** “Your words are saved. The reflection can wait.” Offer Try again / Continue. */
  | { status: 'error' }
  /**
   * The entry suggests the person may be in danger, or thinking of harming themselves or someone
   * else. No reflection was written: Completion offers support in its place.
   */
  | { status: 'support' }
  /** There is no reading agreement, so nothing was sent. Completion's saved card offers it. */
  | { status: 'unagreed' };

/**
 * Takes an id rather than text on purpose: a provider must load and decrypt content itself, behind
 * its own consent check, so plaintext cannot reach a provider by being passed in by default.
 */
export type ReflectionRequest = { entryId: string };

export interface ReflectionProvider {
  reflect(request: ReflectionRequest): Promise<ReflectionOutcome>;
}

export const offlineProvider: ReflectionProvider = {
  reflect: async () => ({ status: 'offline' }),
};

export type ReadingProviderDeps = {
  /** This build has a server that may be used (voiceApi.ts). */
  configured: () => boolean;
  /** The person holds the reading agreement under its current words. */
  agreed: () => boolean;
  getEntry: (id: string) => Promise<JournalResult<Entry | null>>;
  reflect: (text: string) => Promise<ReflectAnswer>;
};

const providerDefaults: ReadingProviderDeps = {
  configured: () => voiceApi() !== null,
  agreed: () => readingAgreed(usePreferences.getState().patternsConsent),
  getEntry,
  reflect: (text) => reflectText(text),
};

/** What is read: the entry's own title, when it has one, and its words. */
const textOf = (entry: Entry) =>
  [entry.title, entry.body]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n');

/**
 * Try again is offered only where it could help. The phone's own lack of a connection, a used
 * allowance, a server without the route, or one that could not write an echo that passed its check
 * all leave the saved card, which is complete as it stands.
 */
function outcomeOf(answer: ReflectAnswer): ReflectionOutcome {
  if (answer.kind === 'reflection') return { status: 'complete', text: answer.text };
  if (answer.kind === 'support') return { status: 'support' };
  return answer.retryable && answer.code !== 'offline'
    ? { status: 'error' }
    : { status: 'offline' };
}

/**
 * Today's echo from ECHO's server. It opens the entry on this phone and sends its words only under
 * the reading agreement. An entry with no words in it, such as a recording that never became words,
 * has nothing to reflect, and is answered with the saved card without asking for anything.
 */
export function createReadingProvider(
  overrides: Partial<ReadingProviderDeps> = {},
): ReflectionProvider {
  const deps = { ...providerDefaults, ...overrides };
  return {
    async reflect({ entryId }) {
      if (!deps.configured()) return { status: 'offline' };
      const found = await deps.getEntry(entryId);
      if (!found.ok) return found.error.retryable ? { status: 'error' } : { status: 'offline' };
      const entry = found.value;
      if (!entry || entry.status !== 'committed') return { status: 'offline' };
      const text = textOf(entry);
      if (!text) return { status: 'offline' };
      if (!deps.agreed()) return { status: 'unagreed' };
      return outcomeOf(await deps.reflect(text));
    },
  };
}

export const readingProvider = createReadingProvider();

/**
 * Safe to call after any commit. Never throws and never writes to the entry, so saving a journal
 * entry cannot depend on it. The entry is durable before this is ever called. A reflection that has
 * been stored is shown again without asking the provider anything.
 */
export async function requestReflection(
  entryId: string,
  provider: ReflectionProvider = readingProvider,
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
