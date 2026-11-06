import {
  useEntries,
  useEntrySearch,
  type AsyncData,
  type EntrySearch,
  type EntrySummary,
} from '@/features/journal';

export type EchoesView =
  | { kind: 'loading' }
  | { kind: 'searching' }
  | { kind: 'error'; searching: boolean }
  | { kind: 'empty' }
  | { kind: 'no_matches'; unreadable: number }
  /** `stale`: the last refresh failed, so the rows may be out of date. */
  | { kind: 'list'; rows: EntrySummary[]; unreadable: number; stale: boolean };

/** What the Echoes page shows. Pure, so every state can be tested without a screen. */
export function deriveEchoesView(
  entries: Pick<AsyncData<EntrySummary[]>, 'status' | 'data'>,
  search: Pick<EntrySearch, 'status' | 'results' | 'unreadable'>,
): EchoesView {
  if (search.status === 'searching') return { kind: 'searching' };
  if (search.status === 'error') return { kind: 'error', searching: true };
  if (search.status === 'ready') {
    return search.results.length === 0
      ? { kind: 'no_matches', unreadable: search.unreadable }
      : { kind: 'list', rows: search.results, unreadable: search.unreadable, stale: false };
  }
  if (!entries.data)
    return entries.status === 'error' ? { kind: 'error', searching: false } : { kind: 'loading' };
  if (entries.data.length === 0) return { kind: 'empty' };
  return { kind: 'list', rows: entries.data, unreadable: 0, stale: entries.status === 'error' };
}

export function useEchoes(query: string) {
  const entries = useEntries();
  const search = useEntrySearch(query);
  const view = deriveEchoesView(entries, search);
  // Retry whichever read failed. A failed search is retried by editing the query.
  return { view, retry: entries.refresh };
}
