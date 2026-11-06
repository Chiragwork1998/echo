import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FilePort } from '@/storage/ports';
import { createTestRuntime, everyStoredByte, nodeFiles } from '@/storage/testing/nodePorts';

import { emptyContent } from './content';
import { createSqlJournal } from './sqlJournal';
import type { JournalResult } from './types';

const SPOKEN = 'what I said out loud for the first time'.repeat(60);

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

async function setup(files?: FilePort) {
  const rt = await createTestRuntime({ files });
  return { rt, journal: createSqlJournal(rt) };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function leaveRecording({ rt }: Setup, name: string, contents = SPOKEN, directoryIndex = 0) {
  const directory = rt.paths.recordingDirs[directoryIndex] ?? '';
  mkdirSync(directory, { recursive: true });
  const uri = join(directory, name);
  writeFileSync(uri, contents);
  return uri;
}

const rows = async ({ rt }: Setup, table: string) =>
  (await rt.db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`))?.total;

describe('launch sweep', () => {
  it('recovers a stranded recording into an encrypted draft', async () => {
    const context = await setup();
    const { journal, rt } = context;
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    const uri = leaveRecording(context, `${recordingId}.aac`);

    // The app dies here. Everything below is the next launch.
    const after = createSqlJournal(await rt.reopen());
    const summary = await after.recoverLeftovers();

    expect(summary).toMatchObject({ recovered: 1, failed: 0, lost: 0 });
    expect(existsSync(uri)).toBe(false);
    const draft = unwrap(await after.getEntry('draft-1'));
    expect(draft).toMatchObject({ status: 'draft', mode: 'voice' });
    expect(draft?.audio).toMatchObject({
      recovered: true,
      durationSeconds: null,
      extension: '.aac',
    });
    const audio = unwrap(await after.openAudio('draft-1'));
    expect(Buffer.from(await rt.files.read(audio.uri)).toString()).toBe(SPOKEN);
    audio.release();
    expect(everyStoredByte(rt.root).includes(SPOKEN.slice(0, 30))).toBe(false);
  });

  it('adds recovered audio to the draft that was being written', async () => {
    const context = await setup();
    const { journal } = context;
    unwrap(await journal.saveDraft('draft-1', emptyContent({ body: 'words typed first' })));
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    leaveRecording(context, `${recordingId}.m4a`);

    await journal.recoverLeftovers();

    const draft = unwrap(await journal.getEntry('draft-1'));
    expect(draft?.body).toBe('words typed first');
    expect(draft?.audio?.recovered).toBe(true);
    expect(unwrap(await journal.listDrafts())).toHaveLength(1);
  });

  it('gives the audio its own draft if the original already has audio', async () => {
    const context = await setup();
    const { journal } = context;
    const first = unwrap(await journal.beginRecording('draft-1'));
    const uri = leaveRecording(context, `${first.recordingId}.m4a`);
    unwrap(
      await journal.attachRecording({
        recordingId: first.recordingId,
        uri,
        draftId: 'draft-1',
        durationSeconds: 5,
        content: emptyContent({ mode: 'voice' }),
      }),
    );
    const second = unwrap(await journal.beginRecording('draft-1'));
    leaveRecording(context, `${second.recordingId}.m4a`);

    await journal.recoverLeftovers();

    expect(unwrap(await journal.listDrafts())).toHaveLength(2);
    expect(unwrap(await journal.getEntry('draft-1'))?.audio?.durationSeconds).toBe(5);
  });

  it('gives the audio its own draft if the original was committed', async () => {
    const context = await setup();
    const { journal } = context;
    unwrap(await journal.commitEntry('entry-1', emptyContent({ body: 'finished' })));
    const { recordingId } = unwrap(await journal.beginRecording('entry-1'));
    leaveRecording(context, `${recordingId}.m4a`);

    await journal.recoverLeftovers();

    expect(unwrap(await journal.getEntry('entry-1'))?.audio).toBeUndefined();
    const drafts = unwrap(await journal.listDrafts());
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.recovered).toBe(true);
  });

  it('recovers a file with no ledger row, from either recording directory', async () => {
    const context = await setup();
    leaveRecording(context, 'unknown-android.aac', SPOKEN, 0);
    leaveRecording(context, 'unknown-ios.m4a', SPOKEN, 1);
    expect((await context.journal.recoverLeftovers()).recovered).toBe(2);
    expect(unwrap(await context.journal.listDrafts())).toHaveLength(2);
  });

  it('does not create a draft from an empty or header-only file', async () => {
    const context = await setup();
    const { journal } = context;
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    const empty = leaveRecording(context, `${recordingId}.m4a`, '');
    const header = leaveRecording(context, 'prepared-only.m4a', 'ftypM4A');

    expect((await journal.recoverLeftovers()).recovered).toBe(0);
    expect(existsSync(empty)).toBe(false);
    expect(existsSync(header)).toBe(false);
    expect(unwrap(await journal.listDrafts())).toEqual([]);
    expect(await rows(context, 'recordings')).toBe(0);
  });

  it('does not duplicate audio that was encrypted before a crash', async () => {
    // The crash came after the row committed and before the plaintext was deleted.
    const context = await setup();
    const { journal, rt } = context;
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    const uri = leaveRecording(context, `${recordingId}.m4a`);
    const failingDelete = createSqlJournal({
      ...rt,
      files: {
        ...rt.files,
        remove: (path) => {
          if (path !== uri) rt.files.remove(path);
          else throw new Error('file busy');
        },
      },
    });
    const attached = await failingDelete.attachRecording({
      recordingId,
      uri,
      draftId: 'draft-1',
      durationSeconds: 8,
      content: emptyContent({ mode: 'voice' }),
    });
    // The audio is safe, so the user is told it saved. Only the cleanup is outstanding.
    expect(attached.ok).toBe(true);
    expect(existsSync(uri)).toBe(true);

    const summary = await journal.recoverLeftovers();

    expect(summary.recovered).toBe(0);
    expect(existsSync(uri)).toBe(false);
    expect(unwrap(await journal.listDrafts())).toHaveLength(1);
    expect(rt.files.list(rt.paths.audioDir)).toHaveLength(1);
    expect(await rows(context, 'recordings')).toBe(0);
  });

  it('keeps the sealed audio when the commit went through and the answer was lost', async () => {
    // The row is written and the plaintext's ledger row says sealed. If the sealed file were then
    // removed because the call threw, the next sweep would delete the plaintext too: nothing would be left.
    const context = await setup();
    const { journal, rt } = context;
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    const uri = leaveRecording(context, `${recordingId}.m4a`);
    const lossy = createSqlJournal({
      ...rt,
      db: {
        ...rt.db,
        transaction: async (task) => {
          await rt.db.transaction(task);
          throw new Error('the reply never came');
        },
      },
    });

    const attached = await lossy.attachRecording({
      recordingId,
      uri,
      draftId: 'draft-1',
      durationSeconds: 8,
      content: emptyContent({ mode: 'voice' }),
    });
    // It did save, so it is said to have saved.
    expect(attached.ok).toBe(true);
    expect(rt.files.list(rt.paths.audioDir)).toHaveLength(1);

    // And after the next launch the recording is still whole and plays.
    const next = await rt.reopen();
    const after = createSqlJournal(next);
    await after.recoverLeftovers();
    const audio = unwrap(await after.openAudio('draft-1'));
    expect(Buffer.from(await next.files.read(audio.uri)).toString()).toBe(SPOKEN);
    audio.release();
  });

  it('keeps the sealed file when it cannot tell whether the commit happened, and loses nothing', async () => {
    const context = await setup();
    const { journal, rt } = context;
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    const uri = leaveRecording(context, `${recordingId}.m4a`);
    let asked = false;
    const blind = createSqlJournal({
      ...rt,
      db: {
        ...rt.db,
        transaction: async (task) => {
          await rt.db.transaction(task);
          asked = true;
          throw new Error('the reply never came');
        },
        first: async (source, params) => {
          if (asked) throw new Error('the database is gone');
          return rt.db.first(source, params);
        },
      },
    });
    const attached = await blind.attachRecording({
      recordingId,
      uri,
      draftId: 'draft-1',
      durationSeconds: 8,
      content: emptyContent({ mode: 'voice' }),
    });
    expect(attached.ok).toBe(false);
    expect(rt.files.list(rt.paths.audioDir)).toHaveLength(1);
    // The plaintext is still there, and the launch that follows leaves one whole recording.
    expect(existsSync(uri)).toBe(true);
    const next = await rt.reopen();
    const after = createSqlJournal(next);
    await after.recoverLeftovers();
    const audio = unwrap(await after.openAudio('draft-1'));
    expect(Buffer.from(await next.files.read(audio.uri)).toString()).toBe(SPOKEN);
    audio.release();
    expect(unwrap(await after.listDrafts())).toHaveLength(1);
  });

  it('removes the sealed file when the commit did not happen, as before', async () => {
    const context = await setup();
    const { journal, rt } = context;
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    const uri = leaveRecording(context, `${recordingId}.m4a`);
    const refusing = createSqlJournal({
      ...rt,
      db: {
        ...rt.db,
        transaction: async () => {
          throw new Error('rolled back');
        },
      },
    });

    const attached = await refusing.attachRecording({
      recordingId,
      uri,
      draftId: 'draft-1',
      durationSeconds: 8,
      content: emptyContent({ mode: 'voice' }),
    });

    expect(attached.ok).toBe(false);
    expect(rt.files.list(rt.paths.audioDir)).toEqual([]);
    // The plaintext is untouched, and the next launch seals it.
    expect(existsSync(uri)).toBe(true);
    await journal.recoverLeftovers();
    expect(unwrap(await journal.getEntry('draft-1'))?.audio?.recovered).toBe(true);
  });

  it('does not bring back a recording whose entry was since deleted', async () => {
    const context = await setup();
    const { journal, rt } = context;
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    const uri = leaveRecording(context, `${recordingId}.m4a`);
    const failingDelete = createSqlJournal({
      ...rt,
      files: {
        ...rt.files,
        remove: (path) => {
          if (path === uri) throw new Error('file busy');
          rt.files.remove(path);
        },
      },
    });
    await failingDelete.attachRecording({
      recordingId,
      uri,
      draftId: 'draft-1',
      durationSeconds: 8,
      content: emptyContent({ mode: 'voice' }),
    });
    unwrap(await journal.discardDraft('draft-1'));

    await journal.recoverLeftovers();

    expect(existsSync(uri)).toBe(false);
    expect(unwrap(await journal.listDrafts())).toEqual([]);
    expect(rt.files.list(rt.paths.audioDir)).toEqual([]);
  });

  it('keeps the plaintext and tries again when sealing fails', async () => {
    let diskFull = true;
    const flaky: FilePort = {
      ...nodeFiles,
      openWriter: (uri) => {
        if (diskFull) throw new Error('disk full');
        return nodeFiles.openWriter(uri);
      },
    };
    const context = await setup(flaky);
    const uri = leaveRecording(context, 'stranded.m4a');

    expect((await context.journal.recoverLeftovers()).failed).toBe(1);
    expect(existsSync(uri)).toBe(true);

    diskFull = false;
    expect((await context.journal.recoverLeftovers()).recovered).toBe(1);
    expect(existsSync(uri)).toBe(false);
  });

  it('carries on past one failure to recover the others', async () => {
    const broken: FilePort = {
      ...nodeFiles,
      openReader: (uri) => {
        if (uri.endsWith('bad.m4a')) throw new Error('unreadable');
        return nodeFiles.openReader(uri);
      },
    };
    const context = await setup(broken);
    leaveRecording(context, 'bad.m4a');
    leaveRecording(context, 'good.m4a');
    expect(await context.journal.recoverLeftovers()).toMatchObject({ recovered: 1, failed: 1 });
  });

  it('reports a recording the OS evicted from its cache as lost', async () => {
    const context = await setup();
    unwrap(await context.journal.beginRecording('draft-1'));
    expect((await context.journal.recoverLeftovers()).lost).toBe(1);
    expect(await rows(context, 'recordings')).toBe(0);
  });

  it('removes decrypted leftovers from playback and export', async () => {
    const context = await setup();
    const { rt } = context;
    mkdirSync(join(rt.paths.tempDir, 'export'), { recursive: true });
    writeFileSync(join(rt.paths.tempDir, 'copy.m4a'), SPOKEN);
    writeFileSync(join(rt.paths.tempDir, 'export', 'echo-export.zip'), SPOKEN);

    await context.journal.recoverLeftovers();

    expect(existsSync(rt.paths.tempDir)).toBe(false);
  });

  it('removes encrypted files no row refers to', async () => {
    const context = await setup();
    const { rt } = context;
    mkdirSync(rt.paths.audioDir, { recursive: true });
    writeFileSync(join(rt.paths.audioDir, 'orphan.enc'), 'ciphertext');
    writeFileSync(join(rt.paths.audioDir, 'partial.enc.tmp'), 'ciphertext');
    expect((await context.journal.recoverLeftovers()).orphansRemoved).toBe(2);
    expect(rt.files.list(rt.paths.audioDir)).toEqual([]);
  });

  it('finishes a delete whose file removal failed', async () => {
    const context = await setup();
    const { journal, rt } = context;
    const { recordingId } = unwrap(await journal.beginRecording('a'));
    const uri = leaveRecording(context, `${recordingId}.m4a`);
    unwrap(
      await journal.attachRecording({
        recordingId,
        uri,
        draftId: 'a',
        durationSeconds: 4,
        content: emptyContent({ mode: 'voice' }),
      }),
    );
    unwrap(await journal.commitEntry('a', emptyContent({ mode: 'voice' })));

    const stuck = createSqlJournal({
      ...rt,
      files: {
        ...rt.files,
        remove: () => {
          throw new Error('file busy');
        },
      },
    });
    expect((await stuck.deleteEntry('a')).ok).toBe(true);
    expect(rt.files.list(rt.paths.audioDir)).toHaveLength(1);

    await journal.recoverLeftovers();
    expect(rt.files.list(rt.paths.audioDir)).toEqual([]);
  });

  it('leaves files that belong to live entries alone', async () => {
    const context = await setup();
    const { journal, rt } = context;
    const { recordingId } = unwrap(await journal.beginRecording('a'));
    const uri = leaveRecording(context, `${recordingId}.m4a`);
    unwrap(
      await journal.attachRecording({
        recordingId,
        uri,
        draftId: 'a',
        durationSeconds: 4,
        content: emptyContent({ mode: 'voice' }),
      }),
    );
    expect((await journal.recoverLeftovers()).orphansRemoved).toBe(0);
    expect(rt.files.list(rt.paths.audioDir)).toHaveLength(1);
  });

  it('does nothing on a clean launch', async () => {
    const { journal } = await setup();
    expect(await journal.recoverLeftovers()).toEqual({
      recovered: 0,
      failed: 0,
      lost: 0,
      orphansRemoved: 0,
    });
  });

  describe('a recording that failed to save, on a draft the user then throws away', () => {
    /** stop() reported save_failed. The plaintext and its ledger row wait for the next launch. */
    async function failedRecording(context: Setup, draftId: string) {
      const { journal, rt } = context;
      const { recordingId } = unwrap(await journal.beginRecording(draftId));
      const uri = leaveRecording(context, `${recordingId}.m4a`);
      const seal = jest.spyOn(rt.vault, 'sealAudioFile').mockRejectedValueOnce(new Error('no'));
      const attached = await journal.attachRecording({
        recordingId,
        uri,
        draftId,
        durationSeconds: 5,
        content: emptyContent({ mode: 'voice' }),
      });
      seal.mockRestore();
      expect(attached.ok).toBe(false);
      expect(existsSync(uri)).toBe(true);
      return uri;
    }

    it('removes the plaintext and leaves the sweep nothing to revive', async () => {
      const context = await setup();
      const { journal } = context;
      unwrap(await journal.saveDraft('a', emptyContent({ body: 'words' })));
      const uri = await failedRecording(context, 'a');

      unwrap(await journal.discardDraft('a'));

      expect(existsSync(uri)).toBe(false);
      expect(await rows(context, 'recordings')).toBe(0);
      expect(await journal.recoverLeftovers()).toMatchObject({ recovered: 0, lost: 0 });
      expect(await rows(context, 'entries')).toBe(0);
    });

    it('does so for a draft that was never saved, which has no row', async () => {
      const context = await setup();
      const { journal } = context;
      const uri = await failedRecording(context, 'a');

      unwrap(await journal.discardDraft('a'));

      expect(existsSync(uri)).toBe(false);
      expect(await rows(context, 'recordings')).toBe(0);
      expect(await journal.recoverLeftovers()).toMatchObject({ recovered: 0 });
      expect(await rows(context, 'entries')).toBe(0);
    });

    it('does so for a recording left in the other platform directory', async () => {
      const context = await setup();
      const { journal } = context;
      const { recordingId } = unwrap(await journal.beginRecording('a'));
      const uri = leaveRecording(context, `${recordingId}.caf`, SPOKEN, 1);

      unwrap(await journal.discardDraft('a'));

      expect(existsSync(uri)).toBe(false);
    });

    it('does so when a draft is removed through deleteEntry', async () => {
      const context = await setup();
      const { journal } = context;
      unwrap(await journal.saveDraft('a', emptyContent({ body: 'words' })));
      const uri = await failedRecording(context, 'a');

      unwrap(await journal.deleteEntry('a'));

      expect(existsSync(uri)).toBe(false);
      expect(await journal.recoverLeftovers()).toMatchObject({ recovered: 0 });
      expect(await rows(context, 'entries')).toBe(0);
    });

    it('does so when a committed entry is deleted, so its audio cannot return', async () => {
      const context = await setup();
      const { journal } = context;
      unwrap(await journal.commitEntry('a', emptyContent({ body: 'words' })));
      const uri = await failedRecording(context, 'a');

      unwrap(await journal.deleteEntry('a'));

      expect(existsSync(uri)).toBe(false);
      expect(await journal.recoverLeftovers()).toMatchObject({ recovered: 0 });
      expect(unwrap(await journal.listDrafts())).toEqual([]);
    });

    it('leaves recordings that belong to other drafts', async () => {
      const context = await setup();
      const { journal } = context;
      unwrap(await journal.saveDraft('a', emptyContent({ body: 'words' })));
      await failedRecording(context, 'a');
      const other = await failedRecording(context, 'b');

      unwrap(await journal.discardDraft('a'));

      expect(existsSync(other)).toBe(true);
      expect(await rows(context, 'recordings')).toBe(1);
    });

    it('keeps the recording when the discard is refused', async () => {
      const context = await setup();
      const { journal } = context;
      unwrap(await journal.commitEntry('a', emptyContent({ body: 'words' })));
      const uri = await failedRecording(context, 'a');

      expect(await journal.discardDraft('a')).toMatchObject({ ok: false });

      expect(existsSync(uri)).toBe(true);
      expect(await rows(context, 'recordings')).toBe(1);
    });
  });

  it('salvages one recording when its screen closes mid-recording', async () => {
    const context = await setup();
    const { journal } = context;
    const { recordingId } = unwrap(await journal.beginRecording('draft-1'));
    const uri = leaveRecording(context, `${recordingId}.m4a`);

    unwrap(await journal.salvageRecording(recordingId));

    expect(existsSync(uri)).toBe(false);
    expect(unwrap(await journal.getEntry('draft-1'))?.audio?.recovered).toBe(true);
  });
});
