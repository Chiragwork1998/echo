import { create } from 'zustand';

import { getJournal } from './runtime';
import {
  failure,
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
): Promise<JournalResult<T>> {
  const result = await withJournal(task);
  if (result.ok) notifyJournalChanged();
  return result;
}

export const newDraftId = async (): Promise<JournalResult<string>> => {
  try {
    const journal = await getJournal();
    return { ok: true, value: await journal.newDraftId() };
  } catch {
    return failure('not_ready');
  }
};

// Autosave deliberately does not notify. Home stays mounted under the session, and refreshing it on
// every save would decrypt rows every few hundred milliseconds. useDraft notifies when it closes.
export const saveDraft = (id: string, content: EntryContent) =>
  withJournal((journal) => journal.saveDraft(id, content));
export const commitEntry = (id: string, content: EntryContent) =>
  mutate((journal) => journal.commitEntry(id, content));
export const discardDraft = (id: string) => mutate((journal) => journal.discardDraft(id));
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
