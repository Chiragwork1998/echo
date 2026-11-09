import { create } from 'zustand';

import { getEntry, reformatEntry } from '@/features/journal/api';
import type { Entry, JournalResult } from '@/features/journal/types';
import { sameWords } from '@/features/journal/words';
import { readingAgreed, usePreferences, voiceStatus } from '@/state/preferences';
import { getRuntime } from '@/storage/runtime';

import { FORMAT_MAX_CHARS, formatText, type FormatAnswer } from './readingApi';
import { voiceApi } from './voiceApi';

// Kept entries set out in paragraphs, punctuation and capitals, every word kept (the contract D-017).
// It happens after an entry is kept, in the background, and nothing waits on it: not the closing of
// the book, not Completion, not Enter your space. What waits is kept here, at module level, so that it
// outlives the session that kept the entry, and on disk as entry ids and times alone, never a word of
// the entry. Nothing here throws, and nothing here logs.

/** One entry waiting to be set out. Its id and some times: nothing it says. */
export type Waiting = {
  id: string;
  /** Failed tries so far. A phone with no connection does not count as one. */
  tries: number;
  /** When it may be tried next, in milliseconds. */
  at: number;
  /** When it began to wait. */
  since: number;
};

/** The first try waits for the book to have closed, so that nothing is asked of the phone while it does. */
const FIRST_AFTER_MS = 1_200;
/** After a launch, nothing is tried until the launch has settled. */
const RESUME_AFTER_MS = 4_000;
/**
 * A failed try is followed by another after each of these waits, three tries in all, and then the
 * entry is let go of. A very long entry may go on failing in a way the server calls passing.
 */
const RETRY_AFTER_MS = [5 * 60_000, 60 * 60_000];
const MOST_TRIES = RETRY_AFTER_MS.length + 1;
/** With no connection, it is looked at again after this long, and the try is not counted. */
const OFFLINE_AFTER_MS = 15 * 60_000;
/** However it went, an entry that has waited this long is let go of. It stays exactly as it was kept. */
const LONGEST_WAIT_MS = 3 * 24 * 60 * 60_000;
/** Far more than anyone keeps between two connections. The oldest go first. */
const MOST_WAITING = 50;

/**
 * Which agreement covers setting an entry out (D-017): a spoken entry's words went to OpenAI under the
 * voice agreement, which says they are set out; what a person wrote goes only under the reading
 * agreement. Each is read as it stands now, so a choice withdrawn stops what has not been sent.
 */
export function settingOutAllowed(
  entry: Pick<Entry, 'mode'>,
  preferences = usePreferences.getState(),
): boolean {
  return entry.mode === 'voice'
    ? voiceStatus(preferences.voiceConsent) === 'allowed'
    : readingAgreed(preferences.patternsConsent);
}

export type FormatQueueDeps = {
  now: () => number;
  /** What waited from before. null when it cannot be read. */
  load: () => Promise<Waiting[] | null>;
  save: (waiting: readonly Waiting[]) => Promise<boolean>;
  /** This build has a server that may be used. */
  configured: () => boolean;
  allowed: (entry: Pick<Entry, 'mode'>) => boolean;
  getEntry: (id: string) => Promise<JournalResult<Entry | null>>;
  reformat: (id: string, text: string) => Promise<JournalResult<Entry>>;
  format: (text: string) => Promise<FormatAnswer>;
  /** Runs `task` after `ms`, and returns a way to call it off. */
  later: (task: () => Promise<void>, ms: number) => () => void;
  /** Which entry is away being set out, or null. */
  setBusy: (id: string | null) => void;
};

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const time = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** What was kept on disk, trusting nothing about its shape. */
export function parseWaiting(value: unknown): Waiting[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Waiting[] => {
    const { id, tries, at, since } = (item ?? {}) as Record<string, unknown>;
    return typeof id === 'string' && ID.test(id) && time(tries) && time(at) && time(since)
      ? [{ id, tries, at, since }]
      : [];
  });
}

const KEY = 'formatQueue';

/**
 * Kept in the plain preferences table, beside the theme: entry ids and times are already readable
 * there without the key (the entries table's own id and time columns), and nothing else is kept.
 * "Delete everything" empties the table. The web preview has no storage, and keeps nothing.
 */
export const formatShelf: Pick<FormatQueueDeps, 'load' | 'save'> = {
  load: async () => {
    try {
      const rt = await getRuntime();
      const row = await rt.db.first<{ value: string }>(
        'SELECT value FROM preferences WHERE key = ?',
        [KEY],
      );
      return row ? parseWaiting(JSON.parse(row.value)) : [];
    } catch {
      return null;
    }
  },
  save: async (waiting) => {
    try {
      const rt = await getRuntime();
      const kept = waiting.map(({ id, tries, at, since }) => ({ id, tries, at, since }));
      await rt.serial(() =>
        kept.length === 0
          ? rt.db.run('DELETE FROM preferences WHERE key = ?', [KEY])
          : rt.db.run(
              `INSERT INTO preferences (key, value) VALUES (?, ?)
               ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
              [KEY, JSON.stringify(kept)],
            ),
      );
      return true;
    } catch {
      return false;
    }
  },
};

type Settled = 'done' | 'later' | 'offline';

/**
 * The queue itself. One entry is set out at a time, the one that has waited longest first. The
 * server's answer is checked here as the server checked it, and the journal checks it once more
 * against the entry as it is stored when it writes, so that no version with a word changed is ever
 * kept. An entry that cannot be set out stays exactly as it was kept.
 */
export function createFormatQueue(deps: FormatQueueDeps) {
  let waiting: Waiting[] = [];
  let loading: Promise<void> | null = null;
  let running = false;
  let timer: { at: number; cancel: () => void } | null = null;

  const load = () => {
    loading ??= deps
      .load()
      .then((kept) => {
        if (!kept) return;
        const added = new Set(waiting.map(({ id }) => id));
        waiting = [...kept.filter(({ id }) => !added.has(id)), ...waiting].slice(-MOST_WAITING);
      })
      .catch(() => undefined);
    return loading;
  };

  const keep = () => deps.save(waiting).catch(() => false);

  /** One timer, for the soonest entry due. */
  const schedule = () => {
    if (running || waiting.length === 0) return;
    const at = Math.min(...waiting.map((item) => item.at));
    if (timer && timer.at <= at) return;
    timer?.cancel();
    const cancel = deps.later(
      () => {
        timer = null;
        return run();
      },
      Math.max(0, at - deps.now()),
    );
    timer = { at, cancel };
  };

  async function settle(item: Waiting): Promise<Settled> {
    if (deps.now() - item.since > LONGEST_WAIT_MS || !deps.configured()) return 'done';
    const found = await deps.getEntry(item.id);
    if (!found.ok) return found.error.retryable ? 'later' : 'done';
    const entry = found.value;
    if (!entry || entry.status !== 'committed' || !deps.allowed(entry)) return 'done';
    const body = entry.body;
    if (body.trim().length === 0 || body.length > FORMAT_MAX_CHARS) return 'done';

    deps.setBusy(item.id);
    try {
      const answer = await deps.format(body);
      // The words came back as they went: too few to set out, already set out, or no version kept
      // every word. Asking again would bring the same.
      if (answer.kind === 'unchanged') return 'done';
      if (answer.kind === 'failed') {
        if (answer.code === 'offline') return 'offline';
        // Again later only where the server said it might pass: busy, a rate limit, OpenAI down.
        return answer.retryable ? 'later' : 'done';
      }
      if (answer.text === body || !sameWords(body, answer.text)) return 'done';
      // Withdrawn while the words were away: what came back is not kept.
      if (!deps.allowed(entry)) return 'done';
      const stored = await deps.reformat(item.id, answer.text);
      return stored.ok || !stored.error.retryable ? 'done' : 'later';
    } finally {
      deps.setBusy(null);
    }
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      await load();
      for (;;) {
        const now = deps.now();
        const [item] = waiting.filter((one) => one.at <= now).sort((a, b) => a.since - b.since);
        if (!item) break;
        const settled = await settle(item).catch((): Settled => 'later');
        const after = deps.now();
        const tries = settled === 'later' ? item.tries + 1 : item.tries;
        waiting = waiting.flatMap((one): Waiting[] => {
          if (one.id !== item.id) return [one];
          if (settled === 'done' || tries >= MOST_TRIES) return [];
          const wait = settled === 'offline' ? OFFLINE_AFTER_MS : RETRY_AFTER_MS[tries - 1]!;
          return [{ ...one, tries, at: after + wait }];
        });
        await keep();
      }
    } finally {
      running = false;
      schedule();
    }
  }

  return {
    /**
     * An entry has just been kept. It waits to be set out only if an agreement covers it, and its
     * first try comes once the book has closed. Never awaited by anyone, and never throws.
     */
    add(entry: Pick<Entry, 'id' | 'mode'>): Promise<void> {
      if (!deps.configured() || !deps.allowed(entry)) return Promise.resolve();
      return (async () => {
        await load();
        if (waiting.some(({ id }) => id === entry.id)) return;
        const now = deps.now();
        waiting = [...waiting, { id: entry.id, tries: 0, at: now + FIRST_AFTER_MS, since: now }];
        waiting = waiting.slice(-MOST_WAITING);
        await keep();
        schedule();
      })().catch(() => undefined);
    },
    /** What waited from before ECHO last closed, picked up once the launch has settled. */
    resume(): Promise<void> {
      return load().then(() => {
        const settledAt = deps.now() + RESUME_AFTER_MS;
        waiting = waiting.map((item) => (item.at < settledAt ? { ...item, at: settledAt } : item));
        schedule();
      });
    },
    /** Tests: what waits now. */
    waiting: () => waiting,
  };
}

/** The entry away being set out right now, for the words that are open on screen. */
const useSettingOut = create<{ busy: string | null }>(() => ({ busy: null }));

/** True while this entry's words are away being set out. */
export const useBeingSetOut = (entryId: string | null): boolean =>
  useSettingOut((state) => entryId !== null && state.busy === entryId);

const queue = createFormatQueue({
  now: () => Date.now(),
  ...formatShelf,
  configured: () => voiceApi() !== null,
  allowed: (entry) => settingOutAllowed(entry),
  getEntry,
  reformat: reformatEntry,
  format: (text) => formatText(text),
  later: (task, ms) => {
    const handle = setTimeout(() => void task(), ms);
    return () => clearTimeout(handle);
  },
  setBusy: (busy) => useSettingOut.setState({ busy }),
});

/** After a commit: set the kept entry out in the background, if an agreement covers it. */
export const queueFormat = (entry: Pick<Entry, 'id' | 'mode'>): void => void queue.add(entry);

/** At launch, once the journal can be opened: what was waiting goes on waiting, and is tried. */
export const resumeFormatting = (): void => void queue.resume();
