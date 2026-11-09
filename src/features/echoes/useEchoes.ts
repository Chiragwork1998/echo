import {
  useEntries,
  useEntrySearch,
  type AsyncData,
  type EntrySearch,
  type EntrySummary,
} from '@/features/journal';

import { useLeftOut } from './removed';

const NONE_REMOVED: ReadonlySet<string> = new Set();

// The same rows, left out the same echoes, are the same array: the page redraws only when its rows
// change, and rows made new at every draw would redraw it without end.
const without = new WeakMap<
  EntrySummary[],
  { removed: ReadonlySet<string>; rows: EntrySummary[] }
>();
function live(rows: EntrySummary[], removed: ReadonlySet<string>): EntrySummary[] {
  if (removed.size === 0) return rows;
  const known = without.get(rows);
  if (known?.removed === removed) return known.rows;
  const left = rows.filter(({ id }) => !removed.has(id));
  without.set(rows, { removed, rows: left });
  return left;
}

export type EchoesView =
  | { kind: 'loading' }
  | { kind: 'searching' }
  | { kind: 'error'; searching: boolean }
  | { kind: 'empty' }
  | { kind: 'no_matches'; unreadable: number }
  /** `stale`: the last refresh failed, so the rows may be out of date. */
  | { kind: 'list'; rows: EntrySummary[]; unreadable: number; stale: boolean };

/**
 * What the Echoes page shows. Pure, so every state can be tested without a screen. `removed` are echoes
 * that have been deleted, which are not listed even while what was read still has them, and
 * `removedFromSearch` those that the search's answer is not to show (see useLeftOut).
 */
export function deriveEchoesView(
  entries: Pick<AsyncData<EntrySummary[]>, 'status' | 'data'>,
  search: Pick<EntrySearch, 'status' | 'results' | 'unreadable'>,
  removed: ReadonlySet<string> = NONE_REMOVED,
  removedFromSearch: ReadonlySet<string> = removed,
): EchoesView {
  if (search.status === 'searching') return { kind: 'searching' };
  if (search.status === 'error') return { kind: 'error', searching: true };
  if (search.status === 'ready') {
    const results = live(search.results, removedFromSearch);
    return results.length === 0
      ? { kind: 'no_matches', unreadable: search.unreadable }
      : { kind: 'list', rows: results, unreadable: search.unreadable, stale: false };
  }
  if (!entries.data)
    return entries.status === 'error' ? { kind: 'error', searching: false } : { kind: 'loading' };
  const rows = live(entries.data, removed);
  if (rows.length === 0) return { kind: 'empty' };
  return { kind: 'list', rows, unreadable: 0, stale: entries.status === 'error' };
}

export function useEchoes(query: string) {
  const entries = useEntries();
  const search = useEntrySearch(query);
  const leftOut = useLeftOut(entries.data, query);
  const view = deriveEchoesView(entries, search, leftOut.listed, leftOut.searched);
  // Retry whichever read failed. A failed search is retried by editing the query.
  return { view, retry: entries.refresh, deleted: leftOut.either };
}
