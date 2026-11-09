import { hasContent, searchIn, toSummary } from './content';
import { deviceClock, type Clock } from './localDay';
import { deriveRhythm } from './rhythm';
import {
  failure,
  success,
  type Entry,
  type EntryContent,
  type Journal,
  type StoredReflection,
} from './types';
import { sameWords } from './words';

export type MemorySeed = { entries?: Entry[]; reflections?: Record<string, StoredReflection> };

/**
 * The same behaviour as the SQL journal with no storage at all. Used for the web preview, which must
 * never persist journal content, and as a test double for screens. journalContract.test.ts holds
 * both implementations to the same rules.
 */
export function createMemoryJournal(seed: MemorySeed = {}, clock: Clock = deviceClock): Journal {
  const entries = new Map((seed.entries ?? []).map((entry) => [entry.id, entry]));
  const reflections = new Map(Object.entries(seed.reflections ?? {}));
  let nextId = 1;

  const committed = () =>
    [...entries.values()]
      .filter((entry) => entry.status === 'committed')
      .sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0));
  const drafts = () =>
    [...entries.values()]
      .filter((entry) => entry.status === 'draft')
      .sort((a, b) => b.updatedAt - a.updatedAt);

  const put = (id: string, content: EntryContent, patch: Partial<Entry>): Entry => {
    const existing = entries.get(id);
    const at = clock.now().getTime();
    const entry: Entry = {
      ...content,
      id,
      status: 'draft',
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      audio: existing?.audio,
      ...patch,
    };
    entries.set(id, entry);
    return entry;
  };

  return {
    newDraftId: async () => `memory-${nextId++}`,
    async saveDraft(id, content) {
      if (entries.get(id)?.status === 'committed') return failure('not_draft');
      return success({ updatedAt: put(id, content, {}).updatedAt });
    },
    async commitEntry(id, content) {
      const existing = entries.get(id);
      if (existing?.status === 'committed') return success(existing);
      if (!hasContent(content, Boolean(existing?.audio))) return failure('empty');
      const moment = clock.now();
      return success(
        put(id, content, {
          status: 'committed',
          committedAt: moment.getTime(),
          localDay: clock.localDay(moment),
        }),
      );
    },
    async reformatEntry(id, text) {
      const existing = entries.get(id);
      if (existing?.status !== 'committed') return failure('not_found');
      if (!sameWords(existing.body, text)) return failure('not_same_words');
      if (existing.body === text) return success(existing);
      const entry: Entry = { ...existing, body: text, updatedAt: clock.now().getTime() };
      entries.set(id, entry);
      return success(entry);
    },
    async discardDraft(id) {
      if (entries.get(id)?.status === 'committed') return failure('not_draft');
      entries.delete(id);
      return success(undefined);
    },
    getEntry: async (id) => success(entries.get(id) ?? null),
    latestDraft: async () => success(drafts()[0] ?? null),
    async latestEntry() {
      const [newest] = committed();
      return success(newest ? toSummary(newest) : null);
    },
    listDrafts: async () => success(drafts().map(toSummary)),
    listEntries: async () => success(committed().map(toSummary)),
    hasCommittedEntries: async () => success(committed().length > 0),
    async deleteEntry(id) {
      entries.delete(id);
      reflections.delete(id);
      return success(undefined);
    },
    searchEntries: async (query, options) =>
      success(searchIn(committed(), query, 0, options?.isCancelled)),
    async getRhythm() {
      const rows = committed().map((entry) => ({ day: entry.localDay ?? '', count: 1 }));
      return success(deriveRhythm(rows, clock.localDay(clock.now())));
    },
    async saveReflection(id, reflection) {
      reflections.set(id, reflection);
      return success(undefined);
    },
    getReflection: async (id) => success(reflections.get(id) ?? null),
    beginRecording: async () => failure('unavailable'),
    attachRecording: async () => failure('unavailable'),
    abandonRecording: async () => success(undefined),
    salvageRecording: async () => success(undefined),
    openAudio: async () => failure('unavailable'),
  };
}
