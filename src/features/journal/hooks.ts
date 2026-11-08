import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  getEntry,
  getRhythm,
  latestDraft,
  latestEntry,
  listEntries,
  searchEntries,
  useJournalRevision,
} from './api';
import { minutesLeft, recordingAwaitsWords, toSummary } from './content';
import { deviceClock } from './localDay';
import { deriveRhythm, type Rhythm } from './rhythm';
import type { Entry, EntrySummary, JournalError, JournalResult, SearchResults } from './types';

const SEARCH_DEBOUNCE_MS = 250;

export type AsyncData<T> = {
  /** 'loading' only before the first result. Refreshes keep showing the previous data. */
  status: 'loading' | 'ready' | 'error';
  data: T | null;
  error: JournalError | null;
  refresh(): Promise<void>;
};

function useJournalData<T>(load: () => Promise<JournalResult<T>>): AsyncData<T> {
  const revision = useJournalRevision((state) => state.revision);
  const [state, setState] = useState<Omit<AsyncData<T>, 'refresh'>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    latest.current += 1;
    const ticket = latest.current;
    const result = await load();
    if (ticket !== latest.current) return; // A newer load has started. Its answer wins.
    setState((previous) =>
      result.ok
        ? { status: 'ready', data: result.value, error: null }
        : { status: 'error', data: previous.data, error: result.error },
    );
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh, revision]);

  return { ...state, refresh };
}

/** All committed entries, newest first. Rows with readable: false failed to decrypt. */
export const useEntries = () => useJournalData(listEntries);

export function useEntry(id: string | null): AsyncData<Entry | null> {
  const load = useCallback(
    async (): Promise<JournalResult<Entry | null>> =>
      id ? getEntry(id) : { ok: true, value: null },
    [id],
  );
  return useJournalData(load);
}

/** The newest committed entry. What Completion shows, including after a restart. */
export const useLatestEntry = () => useJournalData(latestEntry);

/** Refreshes when the app returns to the foreground, so that it rolls over at midnight. */
export function useRhythm(): AsyncData<Rhythm> {
  const data = useJournalData(getRhythm);
  const { refresh } = data;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  return data;
}

export type ContinueDraft = EntrySummary & {
  minutesLeft: number;
  /** It holds a recording that has not become words yet, so it opens where that is offered. */
  untranscribed: boolean;
};

export type HomeSummary = {
  status: 'loading' | 'ready' | 'error';
  /** Always present: an empty week until data arrives, so Home never has to branch on null. */
  rhythm: Rhythm;
  /** null shows “Your first echo will appear here.” */
  recent: EntrySummary | null;
  /** null hides the Continue an echo card. */
  continueDraft: ContinueDraft | null;
  error: JournalError | null;
  refresh(): Promise<void>;
};

export function useHomeSummary(): HomeSummary {
  const rhythm = useRhythm();
  const recent = useLatestEntry();
  const load = useCallback(async (): Promise<JournalResult<ContinueDraft | null>> => {
    const draft = await latestDraft();
    if (!draft.ok) return draft;
    if (!draft.value) return { ok: true, value: null };
    const summary = toSummary(draft.value);
    return {
      ok: true,
      value: {
        ...summary,
        minutesLeft: minutesLeft(summary.durationSeconds),
        untranscribed: recordingAwaitsWords(draft.value),
      },
    };
  }, []);
  const continueDraft = useJournalData(load);

  const all = [rhythm, recent, continueDraft];
  const { refresh: refreshRhythm } = rhythm;
  const { refresh: refreshRecent } = recent;
  const { refresh: refreshDraft } = continueDraft;
  const refresh = useCallback(async () => {
    await Promise.all([refreshRhythm(), refreshRecent(), refreshDraft()]);
  }, [refreshDraft, refreshRecent, refreshRhythm]);

  return {
    status: all.some((part) => part.status === 'error')
      ? 'error'
      : all.some((part) => part.status === 'loading')
        ? 'loading'
        : 'ready',
    rhythm: rhythm.data ?? deriveRhythm([], deviceClock.localDay(deviceClock.now())),
    recent: recent.data,
    continueDraft: continueDraft.data,
    error: all.find((part) => part.error)?.error ?? null,
    refresh,
  };
}

export type EntrySearch = {
  /** 'idle' while the query is blank. */
  status: 'idle' | 'searching' | 'ready' | 'error';
  results: EntrySummary[];
  /** Entries that could not be searched because they failed to decrypt. */
  unreadable: number;
  error: JournalError | null;
};

const NO_RESULTS: SearchResults = { results: [], unreadable: 0 };

type SettledSearch = { query: string; result: JournalResult<SearchResults> };

/** Decrypts in memory on this device. Nothing is indexed, cached on disk, or sent anywhere. */
export function useEntrySearch(query: string): EntrySearch {
  const [settled, setSettled] = useState<SettledSearch | null>(null);
  const blank = !query.trim();

  useEffect(() => {
    if (blank) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchEntries(query, { isCancelled: () => cancelled }).then((result) => {
        if (!cancelled) setSettled({ query, result });
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [blank, query]);

  if (blank) return { status: 'idle', ...NO_RESULTS, error: null };
  if (settled?.query !== query) return { status: 'searching', ...NO_RESULTS, error: null };
  return settled.result.ok
    ? { status: 'ready', ...settled.result.value, error: null }
    : { status: 'error', ...NO_RESULTS, error: settled.result.error };
}
