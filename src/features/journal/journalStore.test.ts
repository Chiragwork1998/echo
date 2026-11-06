import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FilePort } from '@/storage/ports';
import {
  createTestRuntime,
  everyStoredByte,
  nodeFiles,
  type TestRuntime,
} from '@/storage/testing/nodePorts';

import { emptyContent, matchesQuery, toSummary } from './content';
import { deviceClock } from './localDay';
import { createMemoryJournal } from './memoryJournal';
import { createSqlJournal } from './sqlJournal';
import type { Entry, EntryContent, Journal, JournalResult } from './types';

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

const text = (body: string, extra: Partial<EntryContent> = {}) => emptyContent({ body, ...extra });

// Secrets written below. Each is searched for, byte for byte, in everything on disk.
const SECRET_BODY = 'I never told anyone about the letter';
const SECRET_TITLE = 'The letter in the drawer';
const SECRET_PROMPT = 'What are you carrying that no one can see?';
const SECRET_REFLECTION = 'You are holding more than you say';
const SECRET_AUDIO = 'pretend-this-is-a-spoken-confession'.repeat(40);

/** The rules every journal must follow, on-disk or in-memory. */
describe.each([
  ['sql', async (): Promise<Journal> => createSqlJournal(await createTestRuntime())],
  ['memory', async (): Promise<Journal> => createMemoryJournal()],
])('journal contract: %s', (_name, make) => {
  let journal: Journal;

  beforeEach(async () => {
    journal = await make();
  });

  it('saves a draft, updates it, and reads the latest back', async () => {
    unwrap(await journal.saveDraft('a', text('first')));
    unwrap(await journal.saveDraft('a', text('second')));
    const entry = unwrap(await journal.getEntry('a'));
    expect(entry?.body).toBe('second');
    expect(entry?.status).toBe('draft');
  });

  it('commits with a local day and timestamp', async () => {
    const entry = unwrap(await journal.commitEntry('a', text('done')));
    expect(entry.status).toBe('committed');
    expect(entry.localDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entry.committedAt).toEqual(expect.any(Number));
  });

  it('treats a repeated commit as the same commit', async () => {
    const first = unwrap(await journal.commitEntry('a', text('done')));
    const second = unwrap(await journal.commitEntry('a', text('a double tap')));
    expect(second).toMatchObject({ body: 'done', committedAt: first.committedAt });
    expect(unwrap(await journal.listEntries())).toHaveLength(1);
  });

  it('refuses to commit nothing', async () => {
    const result = await journal.commitEntry('a', text('   '));
    expect(result).toEqual({ ok: false, error: { code: 'empty', retryable: false } });
  });

  it('will not let a late autosave change a committed entry', async () => {
    unwrap(await journal.commitEntry('a', text('final')));
    expect(await journal.saveDraft('a', text('stale'))).toMatchObject({
      ok: false,
      error: { code: 'not_draft' },
    });
    expect(unwrap(await journal.getEntry('a'))?.body).toBe('final');
  });

  it('lists committed entries newest first and leaves drafts out', async () => {
    unwrap(await journal.commitEntry('old', text('older')));
    await new Promise((resolve) => setTimeout(resolve, 5));
    unwrap(await journal.commitEntry('new', text('newer')));
    unwrap(await journal.saveDraft('draft', text('unfinished')));
    expect(unwrap(await journal.listEntries()).map((entry) => entry.id)).toEqual(['new', 'old']);
  });

  it('finds the newest entry and leaves drafts out of it', async () => {
    unwrap(await journal.commitEntry('old', text('older')));
    await new Promise((resolve) => setTimeout(resolve, 5));
    unwrap(await journal.commitEntry('new', text('newer')));
    unwrap(await journal.saveDraft('draft', text('unfinished')));
    expect(unwrap(await journal.latestEntry())?.id).toBe('new');
  });

  it('finds the newest draft', async () => {
    unwrap(await journal.saveDraft('a', text('one')));
    await new Promise((resolve) => setTimeout(resolve, 5));
    unwrap(await journal.saveDraft('b', text('two')));
    expect(unwrap(await journal.latestDraft())?.id).toBe('b');
    expect(unwrap(await journal.listDrafts())).toHaveLength(2);
  });

  it('removes a discarded draft', async () => {
    unwrap(await journal.saveDraft('a', text('gone')));
    unwrap(await journal.discardDraft('a'));
    expect(unwrap(await journal.getEntry('a'))).toBeNull();
  });

  it('will not discard a committed entry', async () => {
    unwrap(await journal.commitEntry('a', text('kept')));
    expect(await journal.discardDraft('a')).toMatchObject({ ok: false });
    expect(unwrap(await journal.getEntry('a'))?.body).toBe('kept');
  });

  it('removes a deleted entry from list and read', async () => {
    unwrap(await journal.commitEntry('a', text('gone')));
    unwrap(await journal.deleteEntry('a'));
    expect(unwrap(await journal.getEntry('a'))).toBeNull();
    expect(unwrap(await journal.listEntries())).toEqual([]);
    expect(unwrap(await journal.hasCommittedEntries())).toBe(false);
  });

  it('searches title and body, ignoring case and accents', async () => {
    unwrap(await journal.commitEntry('a', text('the Café by the river', { title: 'Morning' })));
    unwrap(await journal.commitEntry('b', text('nothing here')));
    const ids = async (query: string) =>
      unwrap(await journal.searchEntries(query)).results.map((entry) => entry.id);
    expect(await ids('cafe')).toEqual(['a']);
    expect(await ids('morning')).toEqual(['a']);
    expect(await ids('RIVER cafe')).toEqual(['a']);
    expect(await ids('river nothing')).toEqual([]);
    expect(await ids('   ')).toEqual([]);
  });

  it('never searches drafts or deleted entries', async () => {
    unwrap(await journal.saveDraft('a', text('needle')));
    unwrap(await journal.commitEntry('b', text('needle')));
    unwrap(await journal.deleteEntry('b'));
    expect(unwrap(await journal.searchEntries('needle')).results).toEqual([]);
  });

  it('stops a cancelled search', async () => {
    unwrap(await journal.commitEntry('a', text('needle')));
    const { results } = unwrap(await journal.searchEntries('needle', { isCancelled: () => true }));
    expect(results).toEqual([]);
  });
});

describe('search by date', () => {
  const entry = (localDay: string): Entry => ({
    ...text('body'),
    id: 'a',
    status: 'committed',
    createdAt: 0,
    updatedAt: 0,
    localDay,
  });

  it.each(['2026-11-06', 'November 6', 'nov 6', 'november', 'friday', '6 november', '2026'])(
    'matches %s',
    (query) => {
      expect(matchesQuery(entry('2026-11-06'), query)).toBe(true);
    },
  );

  it.each(['october', 'tuesday', '2025-11-06'])('does not match %s', (query) => {
    expect(matchesQuery(entry('2026-11-06'), query)).toBe(false);
  });
});

describe('sql journal', () => {
  let rt: TestRuntime;
  let journal: ReturnType<typeof createSqlJournal>;

  beforeEach(async () => {
    rt = await createTestRuntime();
    journal = createSqlJournal(rt);
  });

  async function saveAudio(draftId: string, content: EntryContent = text('')) {
    const { recordingId } = unwrap(await journal.beginRecording(draftId));
    const directory = rt.paths.recordingDirs[0] ?? '';
    mkdirSync(directory, { recursive: true });
    const uri = join(directory, `${recordingId}.m4a`);
    writeFileSync(uri, SECRET_AUDIO);
    const audio = unwrap(
      await journal.attachRecording({
        recordingId,
        uri,
        draftId,
        durationSeconds: 12,
        content: { ...content, mode: 'voice' },
      }),
    );
    return { audio, plaintextUri: uri };
  }

  const fileCount = () => rt.files.list(rt.paths.audioDir).length;
  const rowCount = async (table: string) =>
    (await rt.db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`))?.total;

  const sealedBytes = async (id: string) => {
    const row = await rt.db.first<{ sealed: Uint8Array }>(
      'SELECT sealed FROM entries WHERE id = ?',
      [id],
    );
    return Buffer.from(row?.sealed ?? []);
  };
  /** Anywhere at all under the app's storage, including the database and its write-ahead log. */
  const onDisk = (bytes: Buffer) => everyStoredByte(rt.root).includes(bytes);

  describe('durability', () => {
    it('keeps a commit through process death, read back from disk', async () => {
      unwrap(await journal.commitEntry('a', text(SECRET_BODY)));
      const after = createSqlJournal(await rt.reopen());
      expect(unwrap(await after.getEntry('a'))).toMatchObject({
        body: SECRET_BODY,
        status: 'committed',
      });
    });

    it('keeps an autosaved draft through process death', async () => {
      unwrap(await journal.saveDraft('a', text('half a thought')));
      const after = createSqlJournal(await rt.reopen());
      expect(unwrap(await after.latestDraft())?.body).toBe('half a thought');
    });

    it('uses FULL synchronous mode, so a commit survives power loss', async () => {
      expect(await rt.db.first('PRAGMA synchronous')).toEqual({ synchronous: 2 });
    });
  });

  describe('a failed write', () => {
    const failWrites = () => {
      const original = rt.db.run;
      rt.db.run = () => Promise.reject(new Error('disk full'));
      return () => {
        rt.db.run = original;
      };
    };

    it('surfaces a typed, retryable error with no content in it', async () => {
      unwrap(await journal.saveDraft('a', text('keep me')));
      failWrites();
      const result = await journal.commitEntry('a', text(SECRET_BODY));
      expect(result).toEqual({ ok: false, error: { code: 'write_failed', retryable: true } });
      expect(JSON.stringify(result)).not.toContain(SECRET_BODY);
    });

    it('leaves the stored draft exactly as it was, and retry succeeds', async () => {
      unwrap(await journal.saveDraft('a', text('keep me')));
      const restore = failWrites();
      expect((await journal.commitEntry('a', text('newer'))).ok).toBe(false);
      expect(unwrap(await journal.getEntry('a'))).toMatchObject({
        body: 'keep me',
        status: 'draft',
      });
      restore();
      expect(unwrap(await journal.commitEntry('a', text('newer'))).body).toBe('newer');
    });

    it('never overwrites a good draft with ciphertext that fails to open', async () => {
      unwrap(await journal.saveDraft('a', text('keep me')));
      const broken = createSqlJournal({
        ...rt,
        vault: { ...rt.vault, openBytes: () => Promise.reject(new Error('native fault')) },
      });
      expect((await broken.saveDraft('a', text('newer'))).ok).toBe(false);
      expect(unwrap(await journal.getEntry('a'))?.body).toBe('keep me');
    });
  });

  describe('ordering', () => {
    it('runs writes one at a time, so the last save wins', async () => {
      const results = await Promise.all(
        ['one', 'two', 'three', 'four'].map((body) => journal.saveDraft('a', text(body))),
      );
      expect(results.every((result) => result.ok)).toBe(true);
      expect(unwrap(await journal.getEntry('a'))?.body).toBe('four');
    });

    it('an autosave queued behind a commit cannot undo it', async () => {
      const [committed, late] = await Promise.all([
        journal.commitEntry('a', text('final')),
        journal.saveDraft('a', text('late')),
      ]);
      expect(committed.ok).toBe(true);
      expect(late.ok).toBe(false);
      expect(unwrap(await journal.getEntry('a'))).toMatchObject({ body: 'final' });
    });
  });

  describe('no plaintext at rest', () => {
    it('stores nothing readable in any row or file, WAL included', async () => {
      unwrap(
        await journal.commitEntry(
          'entry',
          text(SECRET_BODY, {
            title: SECRET_TITLE,
            moodBefore: 'unsettled',
            promptId: 'first-echo',
            promptText: SECRET_PROMPT,
          }),
        ),
      );
      unwrap(
        await journal.saveReflection('entry', { status: 'complete', text: SECRET_REFLECTION }),
      );
      const { plaintextUri } = await saveAudio('voice', text(SECRET_BODY));

      expect(existsSync(plaintextUri)).toBe(false);
      const stored = everyStoredByte(rt.root);
      expect(stored.length).toBeGreaterThan(0);
      for (const secret of [
        SECRET_BODY,
        SECRET_TITLE,
        SECRET_PROMPT,
        SECRET_REFLECTION,
        SECRET_AUDIO.slice(0, 40),
        'unsettled',
        'first-echo',
      ]) {
        expect(stored.includes(secret)).toBe(false);
      }
    });

    it('keeps sealed columns as binary, never as text', async () => {
      unwrap(await journal.saveDraft('a', text(SECRET_BODY)));
      const row = await rt.db.first<{ sealed: Uint8Array }>('SELECT sealed FROM entries');
      expect(row?.sealed).toBeInstanceOf(Uint8Array);
      expect(row?.sealed[0]).toBe(1);
    });

    it('keeps no timezone, which would show where someone was when they wrote', async () => {
      unwrap(await journal.commitEntry('a', text('x')));
      const row = await rt.db.first<Record<string, unknown>>('SELECT * FROM entries');
      expect(Object.keys(row ?? {}).join()).not.toMatch(/tz|zone|offset/i);
    });

    it('stores no hash or length of the plaintext', async () => {
      unwrap(await journal.saveDraft('a', text(SECRET_BODY)));
      const row = await rt.db.first<Record<string, unknown>>('SELECT * FROM entries');
      expect(Object.keys(row ?? {}).sort()).toEqual([
        'committed_at',
        'created_at',
        'deleted_at',
        'id',
        'local_day',
        'sealed',
        'status',
        'updated_at',
      ]);
    });
  });

  describe('binding', () => {
    it('reports a ciphertext moved to another row as unreadable, in place', async () => {
      unwrap(await journal.commitEntry('a', text('mine')));
      unwrap(await journal.commitEntry('b', text('other')));
      await rt.db.exec(`UPDATE entries SET sealed = (SELECT sealed FROM entries WHERE id = 'a')
                        WHERE id = 'b'`);

      expect(await journal.getEntry('b')).toEqual({
        ok: false,
        error: { code: 'unreadable', retryable: false },
      });
      const listed = unwrap(await journal.listEntries());
      expect(listed.find((entry) => entry.id === 'a')?.readable).toBe(true);
      expect(listed.find((entry) => entry.id === 'b')?.readable).toBe(false);
    });

    it('counts unreadable rows in search rather than failing it', async () => {
      unwrap(await journal.commitEntry('a', text('needle')));
      unwrap(await journal.commitEntry('b', text('other')));
      await rt.db.exec(`UPDATE entries SET sealed = x'01' WHERE id = 'b'`);
      const { results, unreadable } = unwrap(await journal.searchEntries('needle'));
      expect(results.map((entry) => entry.id)).toEqual(['a']);
      expect(unreadable).toBe(1);
    });
  });

  describe('an unreadable row at the front of the list', () => {
    const damage = (id: string) =>
      rt.db.exec(`UPDATE entries SET sealed = x'01' WHERE id = '${id}'`);
    const stored = async (id: string) =>
      rt.db.first<{ sealed: Uint8Array }>('SELECT sealed FROM entries WHERE id = ?', [id]);

    /** Saved in this order, so the last one is newest however fast the clock is read. */
    async function drafts(...ids: string[]) {
      for (const [index, id] of ids.entries()) {
        unwrap(await journal.saveDraft(id, text(id)));
        await rt.db.run('UPDATE entries SET updated_at = ? WHERE id = ?', [index, id]);
      }
    }

    async function entries(...ids: string[]) {
      for (const [index, id] of ids.entries()) {
        unwrap(await journal.commitEntry(id, text(id)));
        await rt.db.run('UPDATE entries SET committed_at = ? WHERE id = ?', [index, id]);
      }
    }

    it('does not block the drafts behind it', async () => {
      await drafts('older', 'newest');
      await damage('newest');
      expect(unwrap(await journal.latestDraft())?.id).toBe('older');
    });

    it('does not block the entries behind it', async () => {
      await entries('older', 'newest');
      await damage('newest');
      expect(unwrap(await journal.latestEntry())?.id).toBe('older');
    });

    it('answers none when nothing can be read', async () => {
      await drafts('only');
      await damage('only');
      expect(unwrap(await journal.latestDraft())).toBeNull();
    });

    it('gets past a run of them', async () => {
      await drafts('good', 'bad-1', 'bad-2', 'bad-3');
      await Promise.all([damage('bad-1'), damage('bad-2'), damage('bad-3')]);
      expect(unwrap(await journal.latestDraft())?.id).toBe('good');
    });

    it('gets past a row whose audio details are damaged', async () => {
      await saveAudio('voice');
      await drafts('older');
      await rt.db.run('UPDATE entries SET updated_at = 5 WHERE id = ?', ['voice']);
      await rt.db.exec(`UPDATE audio SET sealed_meta = x'01'`);
      expect(unwrap(await journal.latestDraft())?.id).toBe('older');
    });

    it('never deletes or changes it, and it stays visible as unreadable', async () => {
      await drafts('older', 'newest');
      await damage('newest');
      const before = await stored('newest');

      await journal.latestDraft();
      await journal.latestEntry();

      expect(await stored('newest')).toEqual(before);
      expect(unwrap(await journal.listDrafts())).toContainEqual(
        expect.objectContaining({ id: 'newest', readable: false }),
      );
    });

    it('still reports a database that cannot be read, instead of an empty journal', async () => {
      await drafts('a');
      jest.spyOn(rt.db, 'first').mockRejectedValueOnce(new Error('database is locked'));
      expect(await journal.latestDraft()).toEqual({
        ok: false,
        error: { code: 'read_failed', retryable: true },
      });
      jest.restoreAllMocks();
    });

    it('decrypts only one row when the newest one opens, however long the journal is', async () => {
      await entries('a', 'b', 'c', 'd');
      const open = jest.spyOn(rt.vault, 'openJson');
      await journal.latestEntry();
      expect(open).toHaveBeenCalledTimes(1);
      jest.restoreAllMocks();
    });
  });

  describe('tombstones', () => {
    it('wipes content and keeps only id and timestamps', async () => {
      unwrap(await journal.commitEntry('a', text(SECRET_BODY)));
      unwrap(await journal.saveReflection('a', { status: 'complete', text: SECRET_REFLECTION }));
      unwrap(await journal.deleteEntry('a'));

      expect(await rt.db.first('SELECT id, sealed, local_day, committed_at FROM entries')).toEqual({
        id: 'a',
        sealed: null,
        local_day: null,
        committed_at: null,
      });
      expect(await rowCount('reflections')).toBe(0);
      const row = await rt.db.first<{ deleted_at: number }>('SELECT deleted_at FROM entries');
      expect(row?.deleted_at).toEqual(expect.any(Number));
    });

    it('leaves no readable trace of a deleted entry on disk', async () => {
      unwrap(await journal.commitEntry('a', text(SECRET_BODY)));
      const sealed = await sealedBytes('a');
      expect(onDisk(sealed)).toBe(true);
      unwrap(await journal.deleteEntry('a'));
      expect(onDisk(sealed)).toBe(false);
    });

    it('is a no-op the second time', async () => {
      unwrap(await journal.commitEntry('a', text('x')));
      unwrap(await journal.deleteEntry('a'));
      unwrap(await journal.deleteEntry('a'));
      expect(await rowCount('entries')).toBe(1);
    });

    it('refuses to revive a deleted id', async () => {
      unwrap(await journal.commitEntry('a', text('x')));
      unwrap(await journal.deleteEntry('a'));
      expect(await journal.saveDraft('a', text('back'))).toMatchObject({
        ok: false,
        error: { code: 'not_found' },
      });
      expect(await journal.commitEntry('a', text('back'))).toMatchObject({ ok: false });
    });

    it('a deleted draft leaves no tombstone at all', async () => {
      unwrap(await journal.saveDraft('a', text('x')));
      unwrap(await journal.deleteEntry('a'));
      expect(await rowCount('entries')).toBe(0);
    });
  });

  // The key opens anything that survives here, so a copy in the log is a deleted entry still readable.
  describe('the write-ahead log', () => {
    const checkpoints = () => {
      const first = jest.spyOn(rt.db, 'first');
      const exec = jest.spyOn(rt.db, 'exec');
      return () =>
        [...first.mock.calls, ...exec.mock.calls].filter(([sql]) => sql.includes('wal_checkpoint'))
          .length;
    };

    afterEach(() => jest.restoreAllMocks());

    it('keeps no copy of a discarded draft', async () => {
      unwrap(await journal.saveDraft('a', text(SECRET_BODY)));
      const sealed = await sealedBytes('a');
      expect(onDisk(sealed)).toBe(true);
      unwrap(await journal.discardDraft('a'));
      expect(onDisk(sealed)).toBe(false);
    });

    it('keeps no copy of a draft deleted through deleteEntry', async () => {
      unwrap(await journal.saveDraft('a', text(SECRET_BODY)));
      const sealed = await sealedBytes('a');
      unwrap(await journal.deleteEntry('a'));
      expect(onDisk(sealed)).toBe(false);
    });

    it('keeps no copy of every revision of an entry that was deleted', async () => {
      unwrap(await journal.saveDraft('a', text('the first thing I wrote')));
      const first = await sealedBytes('a');
      unwrap(await journal.saveDraft('a', text('the second thing I wrote')));
      const second = await sealedBytes('a');
      unwrap(await journal.commitEntry('a', text('what I settled on')));
      unwrap(await journal.deleteEntry('a'));
      expect(onDisk(first)).toBe(false);
      expect(onDisk(second)).toBe(false);
    });

    it('drops the old revisions of a draft once it is committed', async () => {
      unwrap(await journal.saveDraft('a', text('a sentence the writer took back')));
      const taken = await sealedBytes('a');
      unwrap(await journal.saveDraft('a', text('what they kept')));
      expect(onDisk(taken)).toBe(true);
      unwrap(await journal.commitEntry('a', text('what they kept')));
      expect(onDisk(taken)).toBe(false);
    });

    it('drops the old revisions of a kept draft on the next launch', async () => {
      unwrap(await journal.saveDraft('a', text('a sentence the writer took back')));
      const taken = await sealedBytes('a');
      unwrap(await journal.saveDraft('a', text('what they kept')));
      await journal.recoverLeftovers();
      expect(onDisk(taken)).toBe(false);
    });

    it('still has the content that is meant to stay', async () => {
      unwrap(await journal.commitEntry('kept', text('still here')));
      unwrap(await journal.commitEntry('gone', text('going')));
      unwrap(await journal.deleteEntry('gone'));
      expect(unwrap(await journal.getEntry('kept'))?.body).toBe('still here');
      const after = createSqlJournal(await rt.reopen());
      expect(unwrap(await after.getEntry('kept'))?.body).toBe('still here');
    });

    it('is not touched by autosave, which runs every few hundred milliseconds', async () => {
      const count = checkpoints();
      for (let index = 0; index < 10; index += 1) {
        unwrap(await journal.saveDraft('a', text(`revision ${index}`)));
      }
      expect(count()).toBe(0);
    });

    it('does not fail a delete that worked if the log could not be emptied', async () => {
      unwrap(await journal.commitEntry('a', text('x')));
      const first = rt.db.first.bind(rt.db);
      jest
        .spyOn(rt.db, 'first')
        .mockImplementation((source, params) =>
          source.includes('wal_checkpoint')
            ? Promise.reject(new Error('database is locked'))
            : first(source, params),
        );
      unwrap(await journal.deleteEntry('a'));
      expect(unwrap(await journal.getEntry('a'))).toBeNull();
    });
  });

  describe('audio lifecycle', () => {
    it('encrypts on stop and deletes the plaintext at once', async () => {
      const { audio, plaintextUri } = await saveAudio('a');
      expect(existsSync(plaintextUri)).toBe(false);
      expect(fileCount()).toBe(1);
      expect(audio).toMatchObject({ durationSeconds: 12, extension: '.m4a', recovered: false });
      expect(await rowCount('recordings')).toBe(0);
    });

    it('returns the original bytes for playback, and release removes them', async () => {
      await saveAudio('a');
      const playable = unwrap(await journal.openAudio('a'));
      expect(Buffer.from(await rt.files.read(playable.uri)).toString()).toBe(SECRET_AUDIO);
      expect(playable.uri.endsWith('.m4a')).toBe(true);
      playable.release();
      expect(existsSync(playable.uri)).toBe(false);
    });

    it('keeps the audio on the entry when it is committed', async () => {
      await saveAudio('a');
      const entry = unwrap(await journal.commitEntry('a', text('', { mode: 'voice' })));
      expect(entry.audio?.durationSeconds).toBe(12);
      expect(toSummary(entry).hasAudio).toBe(true);
    });

    it('holds duration, extension, and mode only in sealed columns', async () => {
      await saveAudio('a');
      const stored = everyStoredByte(rt.root);
      expect(stored.includes('.m4a')).toBe(false);
      expect(stored.includes('voice')).toBe(false);
    });

    it('leaves no file or row after an entry is deleted', async () => {
      await saveAudio('a');
      unwrap(await journal.commitEntry('a', text('', { mode: 'voice' })));
      unwrap(await journal.deleteEntry('a'));
      expect(fileCount()).toBe(0);
      expect(await rowCount('audio')).toBe(0);
    });

    it('leaves no file or row after a draft is discarded', async () => {
      await saveAudio('a');
      unwrap(await journal.discardDraft('a'));
      expect(fileCount()).toBe(0);
      expect(await rowCount('audio')).toBe(0);
      expect(await rowCount('entries')).toBe(0);
    });

    it('re-recording replaces the old file, leaving one', async () => {
      await saveAudio('a');
      await saveAudio('a');
      expect(fileCount()).toBe(1);
      expect(await rowCount('audio')).toBe(1);
    });

    it('does not replace the audio of an entry committed in the meantime', async () => {
      await saveAudio('a');
      const committed = unwrap(await journal.commitEntry('a', text('', { mode: 'voice' })));
      await saveAudio('a');
      expect(unwrap(await journal.getEntry('a'))?.audio?.id).toBe(committed.audio?.id);
      expect(unwrap(await journal.listDrafts())).toHaveLength(1);
      expect(fileCount()).toBe(2);
    });

    it('keeps the plaintext when the ciphertext does not verify', async () => {
      // The sealed file reads back different from what was written to it.
      const corrupting: FilePort = {
        ...nodeFiles,
        openReader: (path) => {
          const reader = nodeFiles.openReader(path);
          if (!path.endsWith('.enc.tmp')) return reader;
          return {
            size: reader.size,
            close: reader.close,
            read: async (offset, length) => {
              const bytes = await reader.read(offset, length);
              if (offset > 0 && bytes.length > 0) bytes[0] = (bytes[0] ?? 0) ^ 0x01;
              return bytes;
            },
          };
        },
      };
      const failing = await createTestRuntime({ files: corrupting });
      const broken = createSqlJournal(failing);
      const { recordingId } = unwrap(await broken.beginRecording('a'));
      const directory = failing.paths.recordingDirs[0] ?? '';
      mkdirSync(directory, { recursive: true });
      const uri = join(directory, `${recordingId}.m4a`);
      writeFileSync(uri, SECRET_AUDIO);

      const result = await broken.attachRecording({
        recordingId,
        uri,
        draftId: 'a',
        durationSeconds: 3,
        content: text(''),
      });

      expect(result).toEqual({ ok: false, error: { code: 'audio_failed', retryable: true } });
      expect(existsSync(uri)).toBe(true);
      expect(failing.files.list(failing.paths.audioDir)).toEqual([]);
      const count = async (table: string) =>
        (await failing.db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`))
          ?.total;
      expect(await count('audio')).toBe(0);
      expect(await count('recordings')).toBe(1);
    });

    it('cancelling removes the file and the ledger row', async () => {
      const { recordingId } = unwrap(await journal.beginRecording('a'));
      const directory = rt.paths.recordingDirs[1] ?? '';
      mkdirSync(directory, { recursive: true });
      const uri = join(directory, `${recordingId}.m4a`);
      writeFileSync(uri, SECRET_AUDIO);
      unwrap(await journal.abandonRecording(recordingId));
      expect(existsSync(uri)).toBe(false);
      expect(await rowCount('recordings')).toBe(0);
    });
  });

  it('seals reflection text and reads it back', async () => {
    unwrap(await journal.commitEntry('a', text('x')));
    unwrap(await journal.saveReflection('a', { status: 'complete', text: SECRET_REFLECTION }));
    expect(unwrap(await journal.getReflection('a'))).toEqual({
      status: 'complete',
      text: SECRET_REFLECTION,
    });
    expect(everyStoredByte(rt.root).includes(SECRET_REFLECTION)).toBe(false);
  });

  it('uses the injected clock for day boundaries', async () => {
    const fixed = createSqlJournal(rt, {
      ...deviceClock,
      now: () => new Date(2026, 0, 2, 12),
    });
    expect(unwrap(await fixed.commitEntry('a', text('x'))).localDay).toBe('2026-01-02');
  });
});
