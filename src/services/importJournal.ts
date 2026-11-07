import { z } from 'zod';

import { notifyJournalChanged } from '@/features/journal/api';
import { deviceClock } from '@/features/journal/localDay';
import type { EntryAudio, EntryContent, EntryStatus } from '@/features/journal/types';
import type { Mood } from '@/state/onboarding';
import { bytesEqual, utf8Decode } from '@/storage/bytes';
import { encodeJson } from '@/storage/envelope';
import { childUri, type FileReader } from '@/storage/ports';
import { getRuntime, type Runtime } from '@/storage/runtime';
import { VaultNotReadyError } from '@/storage/vault';

import {
  copyZipItem,
  readZipIndex,
  readZipItem,
  ZipError,
  type ZipIndex,
  type ZipItem,
} from './zipReader';

// Restore from a backup: reads the echo-export.zip that exportJournal writes, all on this phone, and
// adds what it holds to the journal through the vault, sealed exactly as an entry and a recording
// written here are. Nothing is sent anywhere, nothing already on the phone is changed, and every
// entry lands whole or not at all, so a restore that stops can simply be run again.

/** The newest backup format this build reads. exportJournal writes it. */
export const BACKUP_FORMAT_VERSION = 1;
const MANIFEST = 'entries.json';
const ARCHIVE_NAME = 'backup.zip';

export type BackupLimits = {
  /** The whole file. The zip32 limit, where export stops too, so no ECHO backup is larger. */
  archiveBytes: number;
  /** Entries and drafts in entries.json. */
  entries: number;
  /** Files in the archive: entries.json, entries.md, and one recording for each entry. */
  files: number;
  /** entries.json, which is read and parsed whole. */
  manifestBytes: number;
  /** The zip's table of contents, which is read whole. */
  directoryBytes: number;
};

export const LIMITS: BackupLimits = {
  archiveBytes: 0xffffffff,
  entries: 20_000,
  files: 2 * 20_000 + 2,
  manifestBytes: 64 * 1024 * 1024,
  directoryBytes: 8 * 1024 * 1024,
};

// Each field's limit sits far above anything a person writes and far below anything that could hurt.
const FIELD = {
  title: 2_000,
  body: 2_000_000,
  promptId: 200,
  prompt: 4_000,
  reflection: 200_000,
  /** A week. A session is minutes long. */
  durationSeconds: 7 * 24 * 60 * 60,
} as const;

/** A UUID in practice. No dots or slashes, so `audio/<id><extension>` reads only one way. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const AUDIO_FILE = /^audio\/([A-Za-z0-9_-]{1,128})((?:\.[A-Za-z0-9]{1,10})?)$/;

// Every mood the app has. A Record, so a mood added to the app and not here fails to compile.
const MOODS: Record<Mood, true> = {
  light: true,
  steady: true,
  unsettled: true,
  heavy: true,
  numb: true,
};

const time = z.iso.datetime();

/** One entry exactly as exportJournal writes it: every field present, and no others. */
const entrySchema = z.strictObject({
  id: z.string().regex(ID),
  status: z.enum(['draft', 'committed']),
  createdAt: time,
  committedAt: time.nullable(),
  localDay: z.iso.date().nullable(),
  title: z.string().max(FIELD.title).nullable(),
  body: z.string().max(FIELD.body),
  mode: z.enum(['text', 'voice']),
  moodBefore: z.enum(Object.keys(MOODS) as [Mood, ...Mood[]]).nullable(),
  promptId: z.string().max(FIELD.promptId).nullable(),
  prompt: z.string().max(FIELD.prompt).nullable(),
  durationSeconds: z.number().min(0).max(FIELD.durationSeconds),
  audioFile: z.string().regex(AUDIO_FILE).nullable(),
  reflection: z.string().max(FIELD.reflection).nullable(),
});

const backupSchema = z.strictObject({
  app: z.literal('ECHO'),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: time,
  entries: z.array(entrySchema),
});

type BackupEntry = z.infer<typeof entrySchema>;

export type BackupSummary = {
  /** Kept entries, the ones Echoes lists. */
  entries: number;
  /** Unfinished drafts. They come back as drafts. */
  drafts: number;
  /** 'YYYY-MM-DD'. The first and last day the backup covers, on the calendar of the phone it left. */
  firstDay: string;
  lastDay: string;
};

export type OpenFailure =
  /** Not a zip, or a zip that is not an ECHO export. */
  | 'not_backup'
  /** An ECHO export that another app has unpacked and zipped again, compressed or in a folder. */
  | 'repacked'
  /** A name in the archive reaches outside it. */
  | 'unsafe'
  | 'too_large'
  | 'too_many'
  /** Made by a newer ECHO, in a format this build does not know. */
  | 'newer'
  /** An ECHO export whose contents do not hold together. Nothing was added. */
  | 'damaged'
  | 'empty'
  /** The file could not be read. */
  | 'unreadable'
  /** The journal is not open. */
  | 'not_ready'
  /** No restore on this platform. */
  | 'unavailable';

export type RestoreCounts = {
  /** Entries added. */
  entries: number;
  /** Drafts added. */
  drafts: number;
  /** Skipped: an entry with the same id is on this phone. */
  existing: number;
  /** Skipped: the entry was deleted on this phone, and stays deleted. */
  deleted: number;
  /** Added without their recording, which the backup did not hold whole. */
  withoutAudio: number;
};

export type RestoreResult =
  | ({ ok: true } & RestoreCounts)
  /**
   * Stopped part way, by a full disk or anything else that failed to write. What was counted is on
   * the phone, whole. The rest is not there at all, and restoring the same file again adds it.
   */
  | ({ ok: false; code: 'stopped' | 'not_ready'; done: number; total: number } & RestoreCounts);

export type OpenedBackup = {
  summary: BackupSummary;
  /**
   * Adds every entry that is not already here, in order, and reports progress after each one. Runs
   * once. The plaintext is released when it ends, however it ends.
   */
  restore(onProgress?: (done: number, total: number) => void): Promise<RestoreResult>;
  /** Deletes ECHO's plaintext copy of the backup. Safe to call more than once. */
  release(): void;
};

export type OpenResult = { ok: true; backup: OpenedBackup } | { ok: false; code: OpenFailure };

/** Carries a code and nothing else: errors can reach logs and crash reports. */
class BackupProblem extends Error {
  constructor(readonly code: OpenFailure) {
    super(`backup: ${code}`);
    this.name = 'BackupProblem';
  }
}

function quietly(task: () => void): void {
  try {
    task();
  } catch {
    // The launch sweep clears the temporary folder this works in.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function problemOf(error: unknown): BackupProblem {
  if (error instanceof BackupProblem) return error;
  if (!(error instanceof ZipError)) return new BackupProblem('unreadable');
  switch (error.problem) {
    case 'unsafe_path':
      return new BackupProblem('unsafe');
    case 'too_many':
      return new BackupProblem('too_many');
    case 'too_large':
      return new BackupProblem('too_large');
    case 'inconsistent':
    case 'damaged':
      return new BackupProblem('damaged');
    default:
      return new BackupProblem('not_backup');
  }
}

type Parsed = {
  entries: BackupEntry[];
  /** Each entry's recording in the archive, or null if the backup names one it does not hold. */
  audio: Map<string, ZipItem | null>;
  summary: BackupSummary;
};

/** The day an entry belongs to: its own for a kept entry, the day it was begun for a draft. */
const dayOf = (entry: BackupEntry) =>
  entry.localDay ?? deviceClock.localDay(new Date(Date.parse(entry.createdAt)));

/**
 * Reads and checks the whole backup before anything is written. The archive first (names, sizes,
 * offsets), then entries.json against its checksum, its version, its schema and itself.
 */
async function readBackup(reader: FileReader, limits: BackupLimits): Promise<Parsed> {
  let index: ZipIndex;
  try {
    index = await readZipIndex(reader, {
      maxItems: limits.files,
      maxDirectoryBytes: limits.directoryBytes,
    });
  } catch (error) {
    throw problemOf(error);
  }

  const manifest = index.get(MANIFEST);
  if (!manifest) {
    // Unpacked and zipped again, a backup usually ends up inside a folder of its own.
    const nested = [...index.keys()].some((name) => name.endsWith(`/${MANIFEST}`));
    throw new BackupProblem(nested ? 'repacked' : 'not_backup');
  }
  if (!manifest.stored) throw new BackupProblem('repacked');

  let json: unknown;
  try {
    json = JSON.parse(utf8Decode(await readZipItem(reader, manifest, limits.manifestBytes)));
  } catch (error) {
    // JSON.parse's own error quotes what it failed on, which here is journal text. Never kept.
    throw error instanceof ZipError ? problemOf(error) : new BackupProblem('damaged');
  }

  if (!isRecord(json) || json.app !== 'ECHO') throw new BackupProblem('not_backup');
  const version = json.formatVersion;
  if (typeof version === 'number' && Number.isInteger(version) && version > BACKUP_FORMAT_VERSION) {
    throw new BackupProblem('newer');
  }
  if (Array.isArray(json.entries) && json.entries.length > limits.entries) {
    throw new BackupProblem('too_many');
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) throw new BackupProblem('damaged');

  const entries = parsed.data.entries;
  const ids = new Set<string>();
  const audio = new Map<string, ZipItem | null>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new BackupProblem('damaged');
    ids.add(entry.id);
    // A kept entry has the moment and the day it was kept. A draft has neither.
    const kept = entry.status === 'committed';
    if (kept !== (entry.committedAt !== null) || kept !== (entry.localDay !== null)) {
      throw new BackupProblem('damaged');
    }
    if (entry.audioFile === null) continue;
    if (AUDIO_FILE.exec(entry.audioFile)?.[1] !== entry.id) throw new BackupProblem('damaged');
    const item = index.get(entry.audioFile);
    if (item && !item.stored) throw new BackupProblem('repacked');
    audio.set(entry.id, item ?? null);
  }
  if (entries.length === 0) throw new BackupProblem('empty');

  const days = entries.map(dayOf).sort();
  const drafts = entries.filter((entry) => entry.status === 'draft').length;
  return {
    entries,
    audio,
    summary: {
      entries: entries.length - drafts,
      drafts,
      firstDay: days[0] ?? '',
      lastDay: days[days.length - 1] ?? '',
    },
  };
}

function contentOf(entry: BackupEntry): EntryContent {
  return {
    ...(entry.title === null ? null : { title: entry.title }),
    body: entry.body,
    mode: entry.mode,
    ...(entry.moodBefore === null ? null : { moodBefore: entry.moodBefore }),
    ...(entry.promptId === null ? null : { promptId: entry.promptId }),
    ...(entry.prompt === null ? null : { promptText: entry.prompt }),
    durationSeconds: entry.durationSeconds,
  };
}

type AudioMeta = Omit<EntryAudio, 'id'>;
type SealedAudio = { id: string; target: string; meta: AudioMeta };
type Outcome =
  | { kind: 'restored'; status: EntryStatus; withoutAudio: boolean }
  | { kind: 'existing' }
  | { kind: 'deleted' };

/**
 * Takes the file the document picker copied in, reads it, and holds it for restore() or release().
 * The file is plaintext journal content, so it is moved straight into a folder of ECHO's temporary
 * space that every launch clears, and it is deleted when the restore ends, when the person says Not
 * now, or when anything here fails. `pickedUri` belongs to this call from here on.
 */
export async function openBackup(
  pickedUri: string,
  options: { limits?: Partial<BackupLimits> } = {},
): Promise<OpenResult> {
  const limits: BackupLimits = { ...LIMITS, ...options.limits };
  let rt: Runtime;
  try {
    rt = await getRuntime();
  } catch {
    return { ok: false, code: 'not_ready' };
  }
  const { db, files, paths, vault, newId, serial } = rt;
  const directory = childUri(paths.tempDir, `restore-${newId()}`);
  let reader: FileReader | null = null;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    quietly(() => reader?.close());
    quietly(() => files.removeDirectory(directory));
    quietly(() => files.remove(pickedUri));
  };

  let parsed: Parsed;
  try {
    // The key must be there: everything below ends in the vault.
    try {
      await vault.sealBytes('canary', 'restore', new Uint8Array(1));
    } catch {
      throw new BackupProblem('not_ready');
    }
    files.ensureDirectory(directory);
    const archive = childUri(directory, ARCHIVE_NAME);
    let source = pickedUri;
    try {
      await files.move(pickedUri, archive);
      source = archive;
    } catch {
      // Read where the picker left it. release() deletes it there.
    }
    let size = 0;
    try {
      size = files.size(source);
    } catch {
      throw new BackupProblem('unreadable');
    }
    if (size > limits.archiveBytes) throw new BackupProblem('too_large');
    try {
      reader = files.openReader(source);
    } catch {
      throw new BackupProblem('unreadable');
    }
    parsed = await readBackup(reader, limits);
  } catch (error) {
    release();
    return { ok: false, code: problemOf(error).code };
  }
  const archiveReader: FileReader = reader;

  /** Whether the database names this row, or null when it cannot be asked. */
  async function names(table: 'entries' | 'audio', id: string): Promise<boolean | null> {
    try {
      return (await db.first(`SELECT id FROM ${table} WHERE id = ?`, [id])) !== null;
    } catch {
      return null;
    }
  }

  /** Copies one recording out of the archive. False if the archive's copy is damaged. */
  async function extract(item: ZipItem, uri: string): Promise<boolean> {
    const writer = files.openWriter(uri);
    try {
      await copyZipItem(archiveReader, item, writer);
    } catch (error) {
      quietly(() => writer.close());
      if (error instanceof ZipError) return false;
      throw error;
    }
    writer.close();
    if (files.size(uri) !== item.size) throw new Error('recording was not copied whole');
    return true;
  }

  /**
   * The recording, sealed the way every recording is: frames to a pending file, each read back and
   * matched against the plaintext, then renamed. The plaintext copy lives only for that, and goes
   * whatever happens. null when the archive's copy is missing, empty or damaged.
   */
  async function sealAudio(entry: BackupEntry, item: ZipItem): Promise<SealedAudio | null> {
    if (item.size === 0) return null;
    const id = newId();
    const extension = AUDIO_FILE.exec(entry.audioFile ?? '')?.[2] ?? '';
    const plain = childUri(directory, `${id}${extension}`);
    const target = childUri(paths.audioDir, `${id}.enc`);
    try {
      if (!(await extract(item, plain))) return null;
      await vault.sealAudioFile(id, plain, target);
    } finally {
      quietly(() => files.remove(plain));
    }
    // The export keeps the session's length, not the recording's. They are the same moment.
    const durationSeconds = entry.durationSeconds > 0 ? entry.durationSeconds : null;
    return { id, target, meta: { extension, durationSeconds, recovered: false } };
  }

  /** Proves the sealed entry opens before it is stored, as every entry written here is. */
  async function sealVerified(id: string, content: EntryContent): Promise<Uint8Array> {
    const sealed = await vault.sealJson('entry', id, content);
    const opened = await vault.openBytes('entry', id, sealed);
    if (!bytesEqual(opened, encodeJson(content))) throw new Error('entry did not seal');
    return sealed;
  }

  /** The entry, its recording and its reflection, in one transaction: all of it, or none. */
  async function store(entry: BackupEntry, audio: SealedAudio | null): Promise<void> {
    const created = Date.parse(entry.createdAt);
    const committed = entry.committedAt === null ? null : Date.parse(entry.committedAt);
    // When it was last touched is not in the backup. Its own time keeps it in its place.
    const at = committed ?? created;
    const sealed = await sealVerified(entry.id, contentOf(entry));
    const meta = audio ? await vault.sealJson('audio_meta', audio.id, audio.meta) : null;
    const reflection =
      entry.reflection === null
        ? null
        : await vault.sealJson('reflection', entry.id, entry.reflection);
    try {
      await db.transaction(async () => {
        await db.run(
          `INSERT INTO entries (id, status, sealed, created_at, updated_at, committed_at, local_day)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [entry.id, entry.status, sealed, created, at, committed, entry.localDay],
        );
        if (audio && meta) {
          await db.run(
            'INSERT INTO audio (id, entry_id, sealed_meta, created_at) VALUES (?, ?, ?, ?)',
            [audio.id, entry.id, meta, at],
          );
        }
        if (reflection) {
          await db.run(
            `INSERT INTO reflections (entry_id, status, sealed, created_at, updated_at)
             VALUES (?, 'complete', ?, ?, ?)`,
            [entry.id, reflection, at, at],
          );
        }
      });
    } catch (error) {
      // A transaction that throws may still have committed, if it was the answer that was lost.
      if ((await names('entries', entry.id)) !== true) throw error;
    }
  }

  /** One entry, inside the write queue so nothing can land between the check and the write. */
  async function restoreEntry(entry: BackupEntry): Promise<Outcome> {
    const present = await db.first<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM entries WHERE id = ?',
      [entry.id],
    );
    // Never overwritten. A tombstone is a delete made on this phone, and it stands.
    if (present) return { kind: present.deleted_at === null ? 'existing' : 'deleted' };

    const item = parsed.audio.get(entry.id);
    const audio = item ? await sealAudio(entry, item) : null;
    try {
      await store(entry, audio);
    } catch (error) {
      // The sealed file goes only when the database is known not to name it. Unsure, it stays, and
      // with no row naming it the next launch removes it.
      if (audio && (await names('audio', audio.id)) === false) {
        quietly(() => files.remove(audio.target));
      }
      throw error;
    }
    return {
      kind: 'restored',
      status: entry.status,
      withoutAudio: entry.audioFile !== null && !audio,
    };
  }

  let started = false;

  async function restore(
    onProgress?: (done: number, total: number) => void,
  ): Promise<RestoreResult> {
    const counts: RestoreCounts = {
      entries: 0,
      drafts: 0,
      existing: 0,
      deleted: 0,
      withoutAudio: 0,
    };
    const total = parsed.entries.length;
    let done = 0;
    if (started || released) return { ok: false, code: 'stopped', done, total, ...counts };
    started = true;
    try {
      for (const entry of parsed.entries) {
        const outcome = await serial(() => restoreEntry(entry));
        if (outcome.kind === 'restored') {
          counts[outcome.status === 'draft' ? 'drafts' : 'entries'] += 1;
          if (outcome.withoutAudio) counts.withoutAudio += 1;
        } else {
          counts[outcome.kind] += 1;
        }
        done += 1;
        try {
          onProgress?.(done, total);
        } catch {
          // A screen that fails to draw progress does not stop the restore.
        }
      }
      return { ok: true, ...counts };
    } catch (error) {
      const code = error instanceof VaultNotReadyError ? 'not_ready' : 'stopped';
      return { ok: false, code, done, total, ...counts };
    } finally {
      release();
      // Once, at the end: every list refreshing after each entry would decrypt the journal again
      // and again.
      if (counts.entries + counts.drafts > 0) notifyJournalChanged();
    }
  }

  return { ok: true, backup: { summary: parsed.summary, restore, release } };
}
