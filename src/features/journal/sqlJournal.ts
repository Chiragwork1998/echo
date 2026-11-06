import { bytesEqual } from '@/storage/bytes';
import { DecryptionError, encodeJson } from '@/storage/envelope';
import { childUri, type FileInfo } from '@/storage/ports';
import type { Runtime } from '@/storage/runtime';
import { CANARY_ROW, VaultNotReadyError } from '@/storage/vault';

import { emptyContent, hasContent, searchIn, toSummary, unreadableSummary } from './content';
import { deviceClock, type Clock } from './localDay';
import { deriveRhythm, type DayCount } from './rhythm';
import {
  failure,
  JournalFailure,
  success,
  type AttachRecordingInput,
  type Entry,
  type EntryAudio,
  type EntryContent,
  type Journal,
  type JournalErrorCode,
  type JournalResult,
  type StoredReflection,
} from './types';

/** Below this a file holds a container header at most, with no audible content. */
const MIN_RECOVERABLE_BYTES = 1024;

type EntryRow = {
  id: string;
  status: Entry['status'];
  sealed: Uint8Array | null;
  created_at: number;
  updated_at: number;
  committed_at: number | null;
  local_day: string | null;
  deleted_at: number | null;
  audio_id: string | null;
  audio_meta: Uint8Array | null;
};

type AudioMeta = Omit<EntryAudio, 'id'>;
type RecordingRow = { id: string; draft_id: string | null; sealed_at: number | null };

const SELECT_ENTRY = `
  SELECT e.id, e.status, e.sealed, e.created_at, e.updated_at, e.committed_at, e.local_day,
         e.deleted_at, a.id AS audio_id, a.sealed_meta AS audio_meta
  FROM entries e LEFT JOIN audio a ON a.entry_id = e.id`;

const TABLES = ['recordings', 'reflections', 'audio', 'entries', 'preferences'];

export type RecoverySummary = {
  /** Plaintext recordings now encrypted into drafts. */
  recovered: number;
  /** Recordings that could not be encrypted this launch. Their plaintext stays for the next try. */
  failed: number;
  /** Recordings the OS removed from its cache before they could be rescued. */
  lost: number;
  orphansRemoved: number;
};

export type SqlJournal = Journal & {
  recoverLeftovers(): Promise<RecoverySummary>;
  /** Every entry and draft, for export. Rows that fail to decrypt are counted, not dropped. */
  readAll(): Promise<{ entries: Entry[]; unreadable: number }>;
  readAudio(entry: Entry): Promise<Uint8Array | null>;
  /** Removes all journal data. The canary and the key are destroyed separately, last. */
  wipe(): Promise<void>;
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

const stemOf = (name: string) => name.slice(0, name.length - extensionOf(name).length);

export function createSqlJournal(rt: Runtime, clock: Clock = deviceClock): SqlJournal {
  // Autosave, commit, discard, and audio are read-modify-write. Running them one at a time means a
  // late autosave can never land on top of a commit. The queue is the runtime's, so onboarding and
  // theme writes wait their turn too: see createRuntime.
  const { db, files, paths, vault, newId, now, serial } = rt;

  async function attempt<T>(
    code: JournalErrorCode,
    task: () => Promise<T>,
  ): Promise<JournalResult<T>> {
    try {
      return success(await task());
    } catch (error) {
      if (error instanceof JournalFailure) return failure(error.code);
      if (error instanceof DecryptionError) return failure('unreadable');
      if (error instanceof VaultNotReadyError) return failure('not_ready');
      return failure(code);
    }
  }

  /**
   * Moves the write-ahead log into the database and empties it. secure_delete covers only the
   * database file, so deleted ciphertext stays in the log, where the key still opens it.
   */
  async function truncateLog(): Promise<void> {
    const result = await db.first<{ busy: number }>('PRAGMA wal_checkpoint(TRUNCATE)');
    if (result?.busy) throw new JournalFailure('write_failed');
  }

  /**
   * For after something that leaves old ciphertext behind. Never on autosave: that runs every few
   * hundred milliseconds, so a draft's earlier revisions wait for its commit, delete, or discard, or
   * for the next launch. A failure here cannot undo what already worked, and the launch sweep retries.
   */
  async function scrubLog(): Promise<void> {
    try {
      await truncateLog();
    } catch {
      // Finished by recoverLeftovers.
    }
  }

  const audioUri = (id: string) => childUri(paths.audioDir, `${id}.enc`);

  const findRow = (id: string) => db.first<EntryRow>(`${SELECT_ENTRY} WHERE e.id = ?`, [id]);

  async function decode(row: EntryRow): Promise<Entry> {
    if (!row.sealed) throw new JournalFailure('not_found');
    const content = await vault.openJson<EntryContent>('entry', row.id, row.sealed);
    let audio: EntryAudio | undefined;
    if (row.audio_id && row.audio_meta) {
      const meta = await vault.openJson<AudioMeta>('audio_meta', row.audio_id, row.audio_meta);
      audio = { id: row.audio_id, ...meta };
    }
    return {
      ...content,
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      committedAt: row.committed_at ?? undefined,
      localDay: row.local_day ?? undefined,
      audio,
    };
  }

  /**
   * Proves the sealed bytes open again before they replace the last good copy. Stored content is
   * overwritten here, so a fault in the crypto layer must be caught now, not on the next read.
   */
  async function sealVerified(id: string, content: EntryContent): Promise<Uint8Array> {
    const sealed = await vault.sealJson('entry', id, content);
    const opened = await vault.openBytes('entry', id, sealed);
    if (!bytesEqual(opened, encodeJson(content))) throw new JournalFailure('write_failed');
    return sealed;
  }

  async function removeAudioFile(id: string): Promise<void> {
    try {
      files.remove(audioUri(id));
    } catch {
      // The row is already gone, so the launch sweep will finish this.
    }
  }

  async function loadRows(where: string, order: string) {
    const rows = await db.all<EntryRow>(`${SELECT_ENTRY} WHERE ${where} ORDER BY ${order}`);
    const entries: Entry[] = [];
    const summaries = [];
    for (const row of rows) {
      try {
        const entry = await decode(row);
        entries.push(entry);
        summaries.push(toSummary(entry));
      } catch {
        summaries.push(
          unreadableSummary({
            id: row.id,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            committedAt: row.committed_at ?? undefined,
            localDay: row.local_day ?? undefined,
          }),
        );
      }
    }
    return { entries, summaries, unreadable: rows.length - entries.length };
  }

  /**
   * The newest row that opens, reading one at a time so the usual case decrypts exactly one. A row
   * that fails to open is skipped and left where it is: it must not block everything behind it, and
   * it may open another day. It stays listed as unreadable. Any other failure is not about the row.
   */
  async function newestReadable(where: string, order: string): Promise<Entry | null> {
    for (let offset = 0; ; offset += 1) {
      const row = await db.first<EntryRow>(
        `${SELECT_ENTRY} WHERE ${where} ORDER BY ${order} LIMIT 1 OFFSET ?`,
        [offset],
      );
      if (!row) return null;
      try {
        return await decode(row);
      } catch (error) {
        if (!(error instanceof DecryptionError)) throw error;
      }
    }
  }

  const committedRows = () =>
    loadRows("e.status = 'committed' AND e.deleted_at IS NULL", 'e.committed_at DESC');

  /**
   * The one path that turns plaintext into stored audio. The plaintext is deleted only after the
   * ciphertext has been read back from disk and authenticated and the database row is committed, so
   * any failure before that point leaves the recording intact for the launch sweep.
   */
  async function sealRecording(
    input: AttachRecordingInput,
    recovered: boolean,
  ): Promise<EntryAudio> {
    const plaintext = await files.read(input.uri);
    if (plaintext.length === 0) throw new JournalFailure('audio_failed');

    // A committed entry is final and a deleted one is gone. Audio arriving late becomes a new draft
    // so that it can neither replace what was committed nor disappear.
    let previous = await findRow(input.draftId);
    let draftId = input.draftId;
    let content = input.content;
    if (previous && (previous.status !== 'draft' || previous.deleted_at)) {
      draftId = newId();
      content = emptyContent({ mode: 'voice' });
      previous = null;
    }

    const audioId = newId();
    const target = audioUri(audioId);
    const name = input.uri.slice(input.uri.lastIndexOf('/') + 1);
    const meta: AudioMeta = {
      extension: extensionOf(name),
      durationSeconds: input.durationSeconds,
      recovered,
    };

    try {
      await files.writeAtomic(target, await vault.sealBytes('audio', audioId, plaintext));
      const reread = await vault.openBytes('audio', audioId, await files.read(target));
      if (!bytesEqual(reread, plaintext)) throw new JournalFailure('audio_failed');

      const sealedMeta = await vault.sealJson('audio_meta', audioId, meta);
      const sealedContent = await sealVerified(draftId, content);
      const at = now();

      await db.transaction(async () => {
        if (!previous) {
          await db.run(
            `INSERT INTO entries (id, status, sealed, created_at, updated_at)
             VALUES (?, 'draft', ?, ?, ?)`,
            [draftId, sealedContent, at, at],
          );
        }
        if (previous?.audio_id) await db.run('DELETE FROM audio WHERE id = ?', [previous.audio_id]);
        await db.run(
          'INSERT INTO audio (id, entry_id, sealed_meta, created_at) VALUES (?, ?, ?, ?)',
          [audioId, draftId, sealedMeta, at],
        );
        await db.run('UPDATE recordings SET sealed_at = ? WHERE id = ?', [at, input.recordingId]);
      });
      if (previous?.audio_id) await removeAudioFile(previous.audio_id);
    } catch (error) {
      files.remove(target);
      throw error;
    }

    // The plaintext window closes here. The audio is safe either way, so a failed delete is not a
    // failed save: the sealed ledger row stays, and the sweep removes the file without a new draft.
    try {
      files.remove(input.uri);
      await db.run('DELETE FROM recordings WHERE id = ?', [input.recordingId]);
    } catch {
      // Finished by recoverLeftovers.
    }
    return { id: audioId, ...meta };
  }

  /** The draft a stranded recording belongs to, or a new one if that draft cannot take it. */
  async function recoveryTarget(draftId: string | null): Promise<string> {
    if (draftId) {
      const row = await findRow(draftId);
      // No row: the recording began before the draft's first save, so the id is still free.
      if (!row || (row.status === 'draft' && !row.deleted_at && !row.audio_id)) return draftId;
    }
    return newId();
  }

  async function rescue(file: FileInfo, ledger: RecordingRow | undefined): Promise<boolean> {
    const id = stemOf(file.name);
    if (ledger?.sealed_at != null || file.size < MIN_RECOVERABLE_BYTES) {
      files.remove(file.uri);
      await db.run('DELETE FROM recordings WHERE id = ?', [id]);
      return false;
    }
    await sealRecording(
      {
        recordingId: id,
        uri: file.uri,
        draftId: await recoveryTarget(ledger?.draft_id ?? null),
        durationSeconds: null,
        content: emptyContent({ mode: 'voice' }),
      },
      true,
    );
    return true;
  }

  const recordingFiles = () => paths.recordingDirs.flatMap((directory) => files.list(directory));

  /**
   * A recording that failed to save keeps its plaintext and ledger row for the launch sweep, which
   * would bring it back as a new draft. Throwing the draft away has to take those too. File first:
   * a ledger row with no file reads as lost, but a file with no ledger row would still be rescued.
   */
  async function forgetRecordings(draftId: string): Promise<void> {
    const ledger = await db.all<{ id: string }>('SELECT id FROM recordings WHERE draft_id = ?', [
      draftId,
    ]);
    if (ledger.length === 0) return;
    const ids = new Set(ledger.map((row) => row.id));
    for (const file of recordingFiles()) {
      if (ids.has(stemOf(file.name))) files.remove(file.uri);
    }
    await db.run('DELETE FROM recordings WHERE draft_id = ?', [draftId]);
  }

  return {
    newDraftId: async () => newId(),

    saveDraft: (id, content) =>
      attempt('write_failed', () =>
        serial(async () => {
          const row = await findRow(id);
          if (row?.deleted_at) throw new JournalFailure('not_found');
          if (row && row.status !== 'draft') throw new JournalFailure('not_draft');
          const sealed = await sealVerified(id, content);
          const at = now();
          await db.run(
            `INSERT INTO entries (id, status, sealed, created_at, updated_at)
             VALUES (?, 'draft', ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET sealed = excluded.sealed, updated_at = excluded.updated_at`,
            [id, sealed, at, at],
          );
          return { updatedAt: at };
        }),
      ),

    commitEntry: (id, content) =>
      attempt('write_failed', () =>
        serial(async () => {
          const row = await findRow(id);
          if (row?.deleted_at) throw new JournalFailure('not_found');
          if (row?.status === 'committed') return decode(row);
          if (!hasContent(content, Boolean(row?.audio_id))) throw new JournalFailure('empty');

          const sealed = await sealVerified(id, content);
          const moment = clock.now();
          const at = moment.getTime();
          // One statement, so the entry is either still a draft or fully committed. The local day is
          // captured here, once, and travels with the entry forever.
          await db.run(
            `INSERT INTO entries (id, status, sealed, created_at, updated_at, committed_at, local_day)
             VALUES (?, 'committed', ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
               status = 'committed', sealed = excluded.sealed, updated_at = excluded.updated_at,
               committed_at = excluded.committed_at, local_day = excluded.local_day`,
            [id, sealed, at, at, at, clock.localDay(moment)],
          );
          const stored = await findRow(id);
          if (!stored) throw new JournalFailure('write_failed');
          const entry = await decode(stored);
          await scrubLog();
          return entry;
        }),
      ),

    discardDraft: (id) =>
      attempt('write_failed', () =>
        serial(async () => {
          const row = await findRow(id);
          if (row && row.status !== 'draft') throw new JournalFailure('not_draft');
          await forgetRecordings(id); // Even with no row: recording can start before the first save.
          if (!row) return;
          await db.run('DELETE FROM entries WHERE id = ?', [id]);
          if (row.audio_id) await removeAudioFile(row.audio_id);
          await scrubLog();
        }),
      ),

    getEntry: (id) =>
      attempt('read_failed', async () => {
        const row = await findRow(id);
        return row && !row.deleted_at ? decode(row) : null;
      }),

    latestDraft: () =>
      attempt('read_failed', () =>
        newestReadable("e.status = 'draft' AND e.deleted_at IS NULL", 'e.updated_at DESC'),
      ),

    latestEntry: () =>
      attempt('read_failed', async () => {
        const entry = await newestReadable(
          "e.status = 'committed' AND e.deleted_at IS NULL",
          'e.committed_at DESC',
        );
        return entry ? toSummary(entry) : null;
      }),

    listDrafts: () =>
      attempt('read_failed', async () => {
        const { summaries } = await loadRows(
          "e.status = 'draft' AND e.deleted_at IS NULL",
          'e.updated_at DESC',
        );
        return summaries;
      }),

    listEntries: () => attempt('read_failed', async () => (await committedRows()).summaries),

    hasCommittedEntries: () =>
      attempt('read_failed', async () => {
        const row = await db.first<{ total: number }>(
          `SELECT COUNT(*) AS total FROM entries
           WHERE status = 'committed' AND deleted_at IS NULL`,
        );
        return (row?.total ?? 0) > 0;
      }),

    deleteEntry: (id) =>
      attempt('write_failed', () =>
        serial(async () => {
          const row = await findRow(id);
          if (!row || row.deleted_at) return;
          await forgetRecordings(id);
          if (row.status === 'draft') {
            await db.run('DELETE FROM entries WHERE id = ?', [id]);
          } else {
            const at = now();
            await db.transaction(async () => {
              await db.run('DELETE FROM audio WHERE entry_id = ?', [id]);
              await db.run('DELETE FROM reflections WHERE entry_id = ?', [id]);
              // Only id and timestamps remain, enough for a future sync to propagate the delete.
              await db.run(
                `UPDATE entries SET sealed = NULL, deleted_at = ?, updated_at = ?,
                   committed_at = NULL, local_day = NULL
                 WHERE id = ?`,
                [at, at, id],
              );
            });
          }
          if (row.audio_id) await removeAudioFile(row.audio_id);
          await scrubLog();
        }),
      ),

    searchEntries: (query, options) =>
      attempt('read_failed', async () => {
        const { entries, unreadable } = await committedRows();
        return searchIn(entries, query, unreadable, options?.isCancelled);
      }),

    getRhythm: () =>
      attempt('read_failed', async () => {
        const rows = await db.all<DayCount>(
          `SELECT local_day AS day, COUNT(*) AS count FROM entries
           WHERE status = 'committed' AND deleted_at IS NULL GROUP BY local_day`,
        );
        return deriveRhythm(rows, clock.localDay(clock.now()));
      }),

    saveReflection: (id, reflection) =>
      attempt('write_failed', () =>
        serial(async () => {
          const sealed = reflection.text
            ? await vault.sealJson('reflection', id, reflection.text)
            : null;
          const at = now();
          await db.run(
            `INSERT INTO reflections (entry_id, status, sealed, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (entry_id) DO UPDATE SET
               status = excluded.status, sealed = excluded.sealed,
               updated_at = excluded.updated_at`,
            [id, reflection.status, sealed, at, at],
          );
        }),
      ),

    getReflection: (id) =>
      attempt('read_failed', async () => {
        const row = await db.first<{
          status: StoredReflection['status'];
          sealed: Uint8Array | null;
        }>('SELECT status, sealed FROM reflections WHERE entry_id = ?', [id]);
        if (!row) return null;
        const text = row.sealed
          ? await vault.openJson<string>('reflection', id, row.sealed)
          : undefined;
        return { status: row.status, text };
      }),

    beginRecording: (draftId) =>
      attempt('audio_failed', () =>
        serial(async () => {
          const recordingId = newId();
          // Written before the microphone opens, so a crash always leaves a record of intent.
          await db.run('INSERT INTO recordings (id, draft_id, started_at) VALUES (?, ?, ?)', [
            recordingId,
            draftId,
            now(),
          ]);
          return { recordingId };
        }),
      ),

    attachRecording: (input) =>
      attempt('audio_failed', () => serial(() => sealRecording(input, false))),

    abandonRecording: (recordingId) =>
      attempt('audio_failed', () =>
        serial(async () => {
          for (const file of recordingFiles()) {
            if (stemOf(file.name) === recordingId) files.remove(file.uri);
          }
          await db.run('DELETE FROM recordings WHERE id = ?', [recordingId]);
        }),
      ),

    salvageRecording: (recordingId) =>
      attempt('audio_failed', () =>
        serial(async () => {
          const file = recordingFiles().find((item) => stemOf(item.name) === recordingId);
          if (!file) return;
          const ledger = await db.first<RecordingRow>(
            'SELECT id, draft_id, sealed_at FROM recordings WHERE id = ?',
            [recordingId],
          );
          await rescue(file, ledger ?? undefined);
        }),
      ),

    openAudio: (entryId) =>
      attempt('audio_failed', async () => {
        const row = await findRow(entryId);
        if (!row?.audio_id) throw new JournalFailure('not_found');
        const entry = await decode(row);
        const plaintext = await vault.openBytes(
          'audio',
          row.audio_id,
          await files.read(audioUri(row.audio_id)),
        );
        // Honest limit: the player reads from a path, so a decrypted copy exists while it plays. It
        // lives in the cache, outside backups, and every launch clears the directory.
        files.ensureDirectory(paths.tempDir);
        const uri = childUri(paths.tempDir, `${newId()}${entry.audio?.extension ?? ''}`);
        await files.writeAtomic(uri, plaintext);
        return { uri, release: () => files.remove(uri) };
      }),

    recoverLeftovers: () =>
      serial(async () => {
        const summary: RecoverySummary = { recovered: 0, failed: 0, lost: 0, orphansRemoved: 0 };

        // Decrypted copies for playback or export that a crash left behind. They duplicate stored
        // ciphertext, so nothing is lost by removing them.
        files.removeDirectory(paths.tempDir);

        const ledger = await db.all<RecordingRow>('SELECT id, draft_id, sealed_at FROM recordings');
        const byId = new Map(ledger.map((row) => [row.id, row]));
        for (const file of recordingFiles()) {
          const row = byId.get(stemOf(file.name));
          byId.delete(stemOf(file.name));
          try {
            if (await rescue(file, row)) summary.recovered += 1;
          } catch {
            summary.failed += 1;
          }
        }
        // Ledger rows with no file: the OS cleared its cache, or the file was already removed.
        for (const row of byId.values()) {
          if (row.sealed_at == null) summary.lost += 1;
          await db.run('DELETE FROM recordings WHERE id = ?', [row.id]);
        }

        // Runs last, so audio sealed above is referenced by the time this looks.
        const referenced = await db.all<{ id: string }>('SELECT id FROM audio');
        const keep = new Set(referenced.map((row) => `${row.id}.enc`));
        for (const file of files.list(paths.audioDir)) {
          if (keep.has(file.name)) continue;
          files.remove(file.uri);
          summary.orphansRemoved += 1;
        }
        await scrubLog();
        return summary;
      }),

    readAll: async () => {
      const { entries, unreadable } = await loadRows('e.deleted_at IS NULL', 'e.created_at ASC');
      return { entries, unreadable };
    },

    readAudio: async (entry) => {
      if (!entry.audio) return null;
      const sealed = await files.read(audioUri(entry.audio.id));
      return vault.openBytes('audio', entry.audio.id, sealed);
    },

    wipe: () =>
      serial(async () => {
        // The canary stays. If anything below fails the app carries on under this key, and what it
        // writes next has to be provable on the next launch.
        await db.transaction(async () => {
          for (const table of TABLES) await db.run(`DELETE FROM ${table}`);
          await db.run('DELETE FROM sealed_kv WHERE key <> ?', [CANARY_ROW]);
        });
        await truncateLog();
        files.removeDirectory(paths.audioDir);
        files.removeDirectory(paths.tempDir);
        for (const directory of paths.recordingDirs) files.removeDirectory(directory);
      }),
  };
}
