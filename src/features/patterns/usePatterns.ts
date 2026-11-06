import { useMemo } from 'react';

import { useEntries } from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';

import { computePatterns, type Patterns } from './computePatterns';

export type PatternsState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; patterns: Patterns };

/** Everything is computed here from the echoes on this phone. Nothing is stored or sent. */
export function usePatterns(): { state: PatternsState; retry: () => Promise<void> } {
  const entries = useEntries();
  const today = deviceClock.localDay(deviceClock.now());
  const patterns = useMemo(
    () => (entries.data ? computePatterns(entries.data, today) : null),
    [entries.data, today],
  );
  const state: PatternsState = patterns
    ? { kind: 'ready', patterns }
    : entries.status === 'error'
      ? { kind: 'error' }
      : { kind: 'loading' };
  return { state, retry: entries.refresh };
}
