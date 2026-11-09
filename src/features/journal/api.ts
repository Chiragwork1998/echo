import { create } from 'zustand';

import { getJournal } from './runtime';
import {
  failure,
  type Entry,
  type EntryContent,
  type Journal,
  type JournalResult,
  type PlayableAudio,
  type SearchOptions,
  type StoredReflection,
} from './types';

/** Bumped after every change, so that lists and Home refresh themselves. */
export const useJournalRevision = create<{ revision: number }>(() => ({ revision: 0 }));

export const notifyJournalChanged = () =>
  useJournalRevision.setState(({ revision }) => ({ revision: revision + 1 }));

let lostRecordings = 0;

/** Called by the launch sweep for recordings the OS cleared before they could be encrypted. */
export const noteLostRecordings = (count: number) => {
  lostRecordings += count;
};

/** Hands the news to one caller, so it is told once. */
export const takeLostRecordings = () => {
  const count = lostRecordings;
  lostRecordings = 0;
  return count;
};

async function withJournal<T>(
  task: (journal: Journal) => Promise<JournalResult<T>>,
): Promise<JournalResult<T>> {
  try {
    return await task(await getJournal());
  } catch {
    return failure('not_ready');
  }
}

async function mutate<T>(
  task: (journal: Journal) => Promise<JournalResult<T>>,
  tell: () => void = notifyJournalChanged,
): Promise<JournalResult<T>> {
  const result = await withJournal(task);
  if (result.ok) tell();
  return result;
}

let commitHolds = 0;
let commitOwed = false;

/**
 * Holds the news of an entry being kept until the returned function is called (once is enough; it can be
 * called again). The book shuts as its entry is kept, and Home, beneath the session, and every list refreshed
 * at that moment: re-rendered, read again and drawn again, through the leaf, the cover and its landing. On
 * the walked emulator the landing was felt a quarter of a second late, and a descent was drawn in one frame.
 * Nothing on screen needs the news before the book has gone: Completion reads the entry as it mounts, and
 * Home is hidden until after it. Only a commit's news waits; drafts and recordings tell theirs at once.
 */
export function holdCommitNews(): () => void {
  commitHolds += 1;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    commitHolds -= 1;
    if (commitHolds > 0 || !commitOwed) return;
    commitOwed = false;
    notifyJournalChanged();
  };
}

const tellCommit = () => {
  if (commitHolds > 0) commitOwed = true;
  else notifyJournalChanged();
};

export const newDraftId = async (): Promise<JournalResult<string>> => {
  try {
    const journal = await getJournal();
    return { ok: true, value: await journal.newDraftId() };
  } catch {
    return failure('not_ready');
  }
};

const writing = new Map<string, Promise<unknown>>();

/**
 * One write to a draft at a time, in the order they were asked for. A session that has closed and a
 * session that has reopened can both write the same draft, and a save that reads the draft and then
 * writes it back must not have another save land between the two.
 */
function inOrder<T>(id: string, task: () => Promise<T>): Promise<T> {
  const run = (writing.get(id) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => undefined);
  writing.set(id, tail);
  void tail.then(() => {
    if (writing.get(id) === tail) writing.delete(id);
  });
  return run;
}

// Autosave deliberately does not notify. Home stays mounted under the session, and refreshing it on
// every save would decrypt rows every few hundred milliseconds. useDraft notifies when it closes.
export const saveDraft = (id: string, content: EntryContent) =>
  inOrder(id, () => withJournal((journal) => journal.saveDraft(id, content)));

/**
 * Reads a draft and writes back what `change` makes of it, with no other write to that draft between
 * the two. A draft that is gone, or already kept, is left as it is and the answer is ok.
 */
export const updateDraft = (id: string, change: (entry: Entry) => EntryContent) =>
  inOrder(id, async (): Promise<JournalResult<void>> => {
    const found = await withJournal((journal) => journal.getEntry(id));
    if (!found.ok) return found;
    const entry = found.value;
    if (!entry || entry.status !== 'draft') return { ok: true, value: undefined };
    const saved = await withJournal((journal) => journal.saveDraft(id, change(entry)));
    return saved.ok ? { ok: true, value: undefined } : saved;
  });
export const commitEntry = (id: string, content: EntryContent) =>
  mutate((journal) => journal.commitEntry(id, content), tellCommit);
export const discardDraft = (id: string) => mutate((journal) => journal.discardDraft(id));
/**
 * Clears what a draft that was never written may have left (a recording begun before the first save),
 * and tells no one: no row existed, so no list or Home changes. Telling them anyway costs a refresh of
 * every list on screen, which on the walked emulator held the JS thread a quarter of a second, in the
 * middle of the page's fade.
 */
export const forgetUnwrittenDraft = (id: string) =>
  withJournal((journal) => journal.discardDraft(id));
export const deleteEntry = (id: string) => mutate((journal) => journal.deleteEntry(id));

export const getEntry = (id: string) => withJournal((journal) => journal.getEntry(id));
export const latestDraft = () => withJournal((journal) => journal.latestDraft());
export const latestEntry = () => withJournal((journal) => journal.latestEntry());
export const listDrafts = () => withJournal((journal) => journal.listDrafts());
export const listEntries = () => withJournal((journal) => journal.listEntries());
export const hasCommittedEntries = () => withJournal((journal) => journal.hasCommittedEntries());
export const getRhythm = () => withJournal((journal) => journal.getRhythm());
export const searchEntries = (query: string, options?: SearchOptions) =>
  withJournal((journal) => journal.searchEntries(query, options));

export const getReflection = (id: string) => withJournal((journal) => journal.getReflection(id));
export const saveReflection = (id: string, reflection: StoredReflection) =>
  mutate((journal) => journal.saveReflection(id, reflection));

/**
 * Decrypts an entry's audio to a temporary file for the player. Call release() when playback ends.
 * The plaintext exists on disk until then, or until the next launch if the app dies first.
 */
export const openEntryAudio = (entryId: string): Promise<JournalResult<PlayableAudio>> =>
  withJournal((journal) => journal.openAudio(entryId));
