import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadFeelings, type FeelingCounts } from '@/features/breathe/feelingStore';
import { useEntries, type EntrySummary } from '@/features/journal';
import { deviceClock } from '@/features/journal/localDay';

import { computeBreath, type BreathCounts } from './computeBreath';
import { computePatterns, type Patterns } from './computePatterns';

export type PatternsState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      patterns: Patterns;
      /** Breathe's counts, or null when there is nothing to show. Never part of unlocking. */
      breath: BreathCounts | null;
    };

/**
 * Breathe's sealed counts, read once when Patterns opens. If they cannot be opened the breath line
 * is left out, quietly: the echoes' counts do not depend on it.
 */
function useFeelingCounts() {
  const [read, setRead] = useState<{ settled: boolean; counts: FeelingCounts | null }>({
    settled: false,
    counts: null,
  });
  const latest = useRef(0);
  const reload = useCallback(async () => {
    latest.current += 1;
    const ticket = latest.current;
    const result = await loadFeelings();
    if (ticket !== latest.current) return; // A newer read has started. Its answer wins.
    setRead((previous) => ({
      settled: true,
      counts: result.ok ? result.value : previous.counts,
    }));
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { ...read, reload };
}

/** Worked out here from the echoes and practices on this phone. Nothing is stored or sent. */
export function usePatterns(): {
  state: PatternsState;
  /** The committed entries as listed, for the pattern cards. They are not read from here. */
  entries: readonly EntrySummary[];
  retry: () => Promise<void>;
} {
  const entries = useEntries();
  const feelings = useFeelingCounts();
  const today = deviceClock.localDay(deviceClock.now());
  const patterns = useMemo(
    () => (entries.data ? computePatterns(entries.data, today) : null),
    [entries.data, today],
  );
  const breath = useMemo(
    () => (feelings.counts ? computeBreath(feelings.counts, today) : null),
    [feelings.counts, today],
  );
  const state: PatternsState = !patterns
    ? entries.status === 'error'
      ? { kind: 'error' }
      : { kind: 'loading' }
    : // The locked page shows nothing of Breathe, so it never waits for it.
      patterns.unlocked && !feelings.settled
      ? { kind: 'loading' }
      : { kind: 'ready', patterns, breath };
  const { refresh } = entries;
  const { reload } = feelings;
  const retry = useCallback(async () => {
    await Promise.all([refresh(), reload()]);
  }, [refresh, reload]);
  return { state, entries: entries.data ?? [], retry };
}
