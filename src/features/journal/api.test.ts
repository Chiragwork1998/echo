// The news of an entry being kept can wait (holdCommitNews): the daily book shuts as its entry is kept, and
// Home and every list refreshing at that moment took the JS thread through the ritual. Only a commit's news
// waits, and it is never lost. Invented words only.
import {
  commitEntry,
  discardDraft,
  holdCommitNews,
  newDraftId,
  saveDraft,
  useJournalRevision,
} from './api';
import { createMemoryJournal } from './memoryJournal';
import { setJournal } from './runtime';
import type { EntryContent } from './types';

const WORDS: EntryContent = { body: 'a lantern by the gate', mode: 'text', durationSeconds: 90 };
const revision = () => useJournalRevision.getState().revision;

async function draft(): Promise<string> {
  const id = await newDraftId();
  if (!id.ok) throw new Error('no draft id');
  await saveDraft(id.value, WORDS);
  return id.value;
}

beforeEach(() => setJournal(createMemoryJournal()));
afterEach(() => setJournal(null));

describe('the news of an entry being kept', () => {
  it('is told at once when nothing holds it', async () => {
    const id = await draft();
    const before = revision();
    expect((await commitEntry(id, WORDS)).ok).toBe(true);
    expect(revision()).toBe(before + 1);
  });

  it('waits while it is held, and is told once when it is let go', async () => {
    const id = await draft();
    const before = revision();
    const release = holdCommitNews();
    expect((await commitEntry(id, WORDS)).ok).toBe(true);
    expect(revision()).toBe(before);
    release();
    expect(revision()).toBe(before + 1);
    // Let go of again (the screen going, after the closing let go): nothing more is told.
    release();
    expect(revision()).toBe(before + 1);
  });

  it('waits for the last of two holds', async () => {
    const id = await draft();
    const before = revision();
    const first = holdCommitNews();
    const second = holdCommitNews();
    await commitEntry(id, WORDS);
    first();
    expect(revision()).toBe(before);
    second();
    expect(revision()).toBe(before + 1);
  });

  it('tells nothing when it is let go with nothing kept, or after a commit that failed', async () => {
    const before = revision();
    const release = holdCommitNews();
    // Nothing worth keeping: the journal refuses it.
    const empty = await commitEntry('nothing-here', { ...WORDS, body: '' });
    expect(empty.ok).toBe(false);
    release();
    expect(revision()).toBe(before);
  });

  it('holds nothing else: a draft thrown away is told at once', async () => {
    const id = await draft();
    const before = revision();
    const release = holdCommitNews();
    expect((await discardDraft(id)).ok).toBe(true);
    expect(revision()).toBe(before + 1);
    release();
    expect(revision()).toBe(before + 1);
  });
});
