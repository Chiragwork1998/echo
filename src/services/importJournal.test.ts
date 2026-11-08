// Restore from a backup, against the real database, vault, AES and files. The archive is always one
// that exportJournal wrote from a journal of synthetic entries, or that one with a single thing
// changed, so every refusal here is a refusal of something a person could actually be handed.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32 as nodeCrc32 } from 'node:zlib';

import { useJournalRevision } from '@/features/journal/api';
import { emptyContent } from '@/features/journal/content';
import type { Clock } from '@/features/journal/localDay';
import { sqlJournalFor } from '@/features/journal/runtime';
import { createSqlJournal } from '@/features/journal/sqlJournal';
import type { Entry, JournalResult } from '@/features/journal/types';
import { computePatterns } from '@/features/patterns/computePatterns';
import { utf8Decode, utf8Encode } from '@/storage/bytes';
import { childUri, type FileWriter } from '@/storage/ports';
import { installRuntime } from '@/storage/runtime';
import { expectBytes } from '@/storage/testing/expectBytes';
import { createMemoryFiles, Killed, type MemoryFiles } from '@/storage/testing/memoryFiles';
import { createTestRuntime, everyStoredByte, type TestRuntime } from '@/storage/testing/nodePorts';
import { VaultNotReadyError } from '@/storage/vault';

import { exportJournal } from './exportJournal';
import {
  BACKUP_FORMAT_VERSION,
  openBackup,
  type BackupLimits,
  type OpenFailure,
  type OpenResult,
  type RestoreResult,
} from './importJournal';
import { wavHeader } from './wav';
import { createZipWriter } from './zip';

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

/** Bytes that differ everywhere, with a marker inside so a scan can tell if they reach the disk. */
function recording(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[index] = state >>> 16;
  }
  out.set(utf8Encode('MARKERAUDIO'), 1000);
  return out;
}

// Synthetic content only. Every private field carries a marker the disk and the console are scanned
// for.
const MARK = {
  title: 'MARKERTITLE',
  body: 'MARKERBODY, with मैं and 🌊',
  prompt: 'MARKERPROMPT',
  promptId: 'MARKERPROMPTID',
  reflection: 'MARKERREFLECTION',
  spoken: 'MARKERSPOKEN',
  draft: 'MARKERDRAFT',
  last: 'MARKERLAST',
  audio: 'MARKERAUDIO',
};
const PRIVATE = Object.values(MARK).map((text) => text.split(',')[0] ?? text);
const SPOKEN = recording(1_500_000);

const clockAt = (iso: string, day: string): Clock => ({
  now: () => new Date(iso),
  localDay: () => day,
});

/** A journal of four: three kept between 3 March and 8 November, one with a recording, and a draft. */
async function sourceJournal(): Promise<TestRuntime> {
  const rt = await createTestRuntime({ now: () => Date.parse('2026-07-01T12:00:00.000Z') });
  const on = (iso: string, day: string) => createSqlJournal(rt, clockAt(iso, day));
  unwrap(
    await on('2026-03-03T08:00:00.000Z', '2026-03-03').commitEntry(
      'first',
      emptyContent({
        title: MARK.title,
        body: MARK.body,
        moodBefore: 'heavy',
        promptId: MARK.promptId,
        promptText: MARK.prompt,
        durationSeconds: 420,
      }),
    ),
  );
  unwrap(await on('', '').saveReflection('first', { status: 'complete', text: MARK.reflection }));

  const journal = on('2026-06-10T19:30:00.000Z', '2026-06-10');
  const { recordingId } = unwrap(await journal.beginRecording('voice'));
  const directory = rt.paths.recordingDirs[0] ?? '';
  mkdirSync(directory, { recursive: true });
  const uri = join(directory, `${recordingId}.m4a`);
  writeFileSync(uri, SPOKEN);
  unwrap(
    await journal.attachRecording({
      recordingId,
      uri,
      draftId: 'voice',
      durationSeconds: 95,
      content: emptyContent({ mode: 'voice' }),
    }),
  );
  unwrap(
    await journal.commitEntry(
      'voice',
      emptyContent({ mode: 'voice', body: MARK.spoken, moodBefore: 'light', durationSeconds: 95 }),
    ),
  );

  unwrap(await journal.saveDraft('draft', emptyContent({ body: MARK.draft, durationSeconds: 60 })));
  unwrap(
    await on('2026-11-08T20:00:00.000Z', '2026-11-08').commitEntry(
      'last',
      emptyContent({ body: MARK.last, durationSeconds: 180 }),
    ),
  );
  return rt;
}

/** What exportJournal shares, as bytes. */
async function exported(rt: TestRuntime): Promise<Uint8Array> {
  installRuntime(rt);
  let bytes: Uint8Array | null = null;
  const result = await exportJournal(
    { isAvailable: async () => true, share: async (uri) => void (bytes = readFileSync(uri)) },
    0,
  );
  if (!result.ok || !bytes) throw new Error('export failed');
  return new Uint8Array(bytes);
}

let SOURCE: TestRuntime;
let ZIP: Uint8Array;

beforeAll(async () => {
  SOURCE = await sourceJournal();
  ZIP = await exported(SOURCE);
});

afterEach(() => {
  installRuntime(null);
  jest.restoreAllMocks();
});

/** Where expo-document-picker leaves its copy: the app's cache, inside the root a scan reads. */
function pickerCopy(rt: TestRuntime, bytes: Uint8Array): string {
  const uri = join(rt.root, 'cache', 'DocumentPicker', `${randomUUID()}.zip`);
  const memory = rt.files as Partial<MemoryFiles>;
  if (memory.put) {
    memory.put(uri, bytes);
  } else {
    mkdirSync(dirname(uri), { recursive: true });
    writeFileSync(uri, bytes);
  }
  return uri;
}

async function open(
  rt: TestRuntime,
  bytes: Uint8Array,
  limits?: Partial<BackupLimits>,
): Promise<OpenResult & { picked: string }> {
  installRuntime(rt);
  const picked = pickerCopy(rt, bytes);
  return { ...(await openBackup(picked, { limits })), picked };
}

async function restore(
  rt: TestRuntime,
  bytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<RestoreResult> {
  const opened = await open(rt, bytes);
  if (!opened.ok) throw new Error(`open failed: ${opened.code}`);
  return opened.backup.restore(onProgress);
}

async function codeOf(bytes: Uint8Array, limits?: Partial<BackupLimits>): Promise<OpenFailure> {
  const rt = await createTestRuntime();
  const opened = await open(rt, bytes, limits);
  if (opened.ok) {
    opened.backup.release();
    throw new Error('it opened');
  }
  // Refused: nothing written, and ECHO's plaintext copy of the file gone.
  expect(await rt.db.first('SELECT id FROM entries')).toBeNull();
  expect(existsSync(opened.picked)).toBe(false);
  expect(tempLeft(rt)).toEqual([]);
  return opened.code;
}

/** The zip, unpacked, for changing one thing. */
type Unpacked = { name: string; bytes: Uint8Array }[];

function unpack(zip: Uint8Array): Unpacked {
  const data = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  const count = data.getUint16(end + 10, true);
  let cursor = data.getUint32(end + 16, true);
  const files: Unpacked = [];
  for (let index = 0; index < count; index += 1) {
    const size = data.getUint32(cursor + 24, true);
    const nameLength = data.getUint16(cursor + 28, true);
    const local = data.getUint32(cursor + 42, true);
    const name = utf8Decode(zip.slice(cursor + 46, cursor + 46 + nameLength));
    const start = local + 30 + data.getUint16(local + 26, true) + data.getUint16(local + 28, true);
    files.push({ name, bytes: zip.slice(start, start + size) });
    cursor += 46 + nameLength;
  }
  return files;
}

async function pack(files: Unpacked): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const sink: FileWriter = { write: async (bytes) => void chunks.push(bytes.slice()), close() {} };
  const writer = createZipWriter(sink, new Date(2026, 10, 8));
  for (const file of files) await writer.add(file.name, file.bytes);
  await writer.finish();
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  chunks.reduce((at, chunk) => (out.set(chunk, at), at + chunk.length), 0);
  return out;
}

type Manifest = { app: unknown; formatVersion: unknown; entries: Record<string, unknown>[] };

const manifestOf = (files: Unpacked): Manifest =>
  JSON.parse(
    utf8Decode(files.find((file) => file.name === 'entries.json')?.bytes ?? new Uint8Array()),
  );

/** The export with entries.json changed, and the rest as it was. */
async function withManifest(change: (manifest: Manifest) => unknown): Promise<Uint8Array> {
  const files = unpack(ZIP);
  const manifest = manifestOf(files);
  const next = change(manifest) ?? manifest;
  return pack(
    files.map((file) =>
      file.name === 'entries.json'
        ? {
            name: file.name,
            bytes: utf8Encode(typeof next === 'string' ? next : JSON.stringify(next)),
          }
        : file,
    ),
  );
}

const entryIn = (manifest: Manifest, id: string) => {
  const found = manifest.entries.find((entry) => entry.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

/** The parts of an entry the backup carries. */
function carried(entry: Entry) {
  return {
    id: entry.id,
    status: entry.status,
    createdAt: entry.createdAt,
    committedAt: entry.committedAt,
    localDay: entry.localDay,
    title: entry.title,
    body: entry.body,
    mode: entry.mode,
    moodBefore: entry.moodBefore,
    promptId: entry.promptId,
    promptText: entry.promptText,
    durationSeconds: entry.durationSeconds,
    extension: entry.audio?.extension,
  };
}

/** Every entry as the backup carries it, with its recording's length and checksum. */
async function everything(rt: TestRuntime) {
  const journal = sqlJournalFor(rt);
  const { entries, unreadable } = await journal.readAll();
  expect(unreadable).toBe(0);
  return Promise.all(
    entries.map(async (entry) => {
      const audio = await journal.readAudio(entry);
      return {
        ...carried(entry),
        audio: audio && { length: audio.length, crc: nodeCrc32(audio) },
        reflection: unwrap(await journal.getReflection(entry.id))?.text,
      };
    }),
  );
}

/** What is left in the folder for short-lived plaintext. */
function tempLeft(rt: TestRuntime): string[] {
  if (!existsSync(rt.paths.tempDir)) return [];
  return readdirSync(rt.paths.tempDir, { recursive: true }).map(String);
}

describe('a round trip', () => {
  it('reads the version export writes, and no newer one', () => {
    expect(manifestOf(unpack(ZIP)).formatVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it('gives back the same entries, reflections and recordings', async () => {
    const target = await createTestRuntime();
    const opened = await open(target, ZIP);
    if (!opened.ok) throw new Error(opened.code);
    expect(opened.backup.summary).toEqual({
      entries: 3,
      drafts: 1,
      firstDay: '2026-03-03',
      lastDay: '2026-11-08',
    });

    expect(await opened.backup.restore()).toEqual({
      ok: true,
      entries: 3,
      drafts: 1,
      existing: 0,
      deleted: 0,
      withoutAudio: 0,
    });

    const after = await everything(target);
    expect(after).toEqual(await everything(SOURCE));
    expect(after.filter((entry) => entry.audio)).toHaveLength(1);
    const journal = sqlJournalFor(target);
    const voice = unwrap(await journal.getEntry('voice'));
    expectBytes(voice && (await journal.readAudio(voice)), SPOKEN);
  });

  it('exports again to the same entries.json and the same recording', async () => {
    const target = await createTestRuntime();
    await restore(target, ZIP);
    const again = unpack(await exported(target));
    const first = unpack(ZIP);
    const strip = (files: Unpacked) => {
      const { exportedAt, ...rest } = manifestOf(files) as Manifest & { exportedAt: string };
      return rest;
    };
    expect(strip(again)).toEqual(strip(first));
    expect(again.map((file) => file.name).sort()).toEqual(first.map((file) => file.name).sort());
    expectBytes(
      again.find((file) => file.name === 'audio/voice.m4a')?.bytes ?? null,
      first.find((file) => file.name === 'audio/voice.m4a')?.bytes ?? new Uint8Array(),
    );
  });

  it('seals every entry, recording and reflection, and leaves no plaintext on the phone', async () => {
    const target = await createTestRuntime();
    const opened = await open(target, ZIP);
    if (!opened.ok) throw new Error(opened.code);
    await opened.backup.restore();
    await target.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const stored = everyStoredByte(target.root);
    expect(PRIVATE.filter((secret) => stored.includes(secret))).toEqual([]);
    expect(existsSync(opened.picked)).toBe(false);
    expect(tempLeft(target)).toEqual([]);
    // One sealed recording, named by its row, and it plays.
    const audio = await target.db.all<{ id: string }>('SELECT id FROM audio');
    expect(target.files.list(target.paths.audioDir).map((file) => file.name)).toEqual(
      audio.map((row) => `${row.id}.enc`),
    );
    const playable = unwrap(await sqlJournalFor(target).openAudio('voice'));
    expectBytes(new Uint8Array(readFileSync(playable.uri)), SPOKEN);
    playable.release();
  });

  it('shows up in Echoes, Patterns and Home like entries written here', async () => {
    const target = await createTestRuntime();
    const revision = useJournalRevision.getState().revision;
    await restore(target, ZIP);
    expect(useJournalRevision.getState().revision).toBe(revision + 1);

    // Sunday 8 November closes the week that began on Monday 2 November.
    const journal = createSqlJournal(target, clockAt('2026-11-08T21:00:00.000Z', '2026-11-08'));
    const listed = unwrap(await journal.listEntries());
    expect(listed.map((entry) => entry.id)).toEqual(['last', 'voice', 'first']);
    expect(unwrap(await journal.latestEntry())?.id).toBe('last');
    expect(unwrap(await journal.latestDraft())?.id).toBe('draft');

    const rhythm = unwrap(await journal.getRhythm());
    expect(rhythm.totalReflections).toBe(3);
    expect(rhythm.totalDays).toBe(3);
    expect(rhythm.week.find((day) => day.day === '2026-11-08')?.completed).toBe(true);
    expect(rhythm.weekReflections).toBe(1);

    const patterns = computePatterns(listed, '2026-11-08');
    expect(patterns.reflections).toBe(3);
    expect(patterns.moodTotals).toMatchObject({ heavy: 1, light: 1 });
    expect(patterns.totalMinutes).toBe(Math.round((420 + 95 + 180) / 60));

    const found = unwrap(await journal.searchEntries('MARKERSPOKEN'));
    expect(found.results.map((entry) => entry.id)).toEqual(['voice']);
  });

  it('reports progress after every entry', async () => {
    const seen: [number, number][] = [];
    await restore(await createTestRuntime(), ZIP, (done, total) => seen.push([done, total]));
    expect(seen).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it('carries on if the screen fails to draw progress', async () => {
    const result = await restore(await createTestRuntime(), ZIP, () => {
      throw new Error('a render that failed');
    });
    expect(result).toMatchObject({ ok: true, entries: 3, drafts: 1 });
  });
});

describe('what is already on this phone', () => {
  it('is skipped and never overwritten', async () => {
    const target = await createTestRuntime();
    const journal = sqlJournalFor(target);
    unwrap(await journal.commitEntry('first', emptyContent({ body: 'written on this phone' })));
    unwrap(await journal.saveDraft('draft', emptyContent({ body: 'a draft on this phone' })));

    expect(await restore(target, ZIP)).toEqual({
      ok: true,
      entries: 2,
      drafts: 0,
      existing: 2,
      deleted: 0,
      withoutAudio: 0,
    });
    expect(unwrap(await journal.getEntry('first'))?.body).toBe('written on this phone');
    expect(unwrap(await journal.getReflection('first'))).toBeNull();
    expect(unwrap(await journal.getEntry('draft'))?.body).toBe('a draft on this phone');
    expect(unwrap(await journal.getEntry('voice'))?.body).toBe(MARK.spoken);
  });

  it('stays deleted if it was deleted here', async () => {
    const target = await createTestRuntime();
    const journal = sqlJournalFor(target);
    unwrap(await journal.commitEntry('voice', emptyContent({ body: 'gone' })));
    unwrap(await journal.deleteEntry('voice'));

    expect(await restore(target, ZIP)).toMatchObject({ ok: true, entries: 2, deleted: 1 });
    expect(unwrap(await journal.getEntry('voice'))).toBeNull();
    expect(target.files.list(target.paths.audioDir)).toEqual([]);
  });

  it('is everything, the second time the same backup is restored', async () => {
    const target = await createTestRuntime();
    await restore(target, ZIP);
    const revision = useJournalRevision.getState().revision;
    expect(await restore(target, ZIP)).toEqual({
      ok: true,
      entries: 0,
      drafts: 0,
      existing: 4,
      deleted: 0,
      withoutAudio: 0,
    });
    // Nothing changed, so nothing is asked to refresh.
    expect(useJournalRevision.getState().revision).toBe(revision);
    expect(target.files.list(target.paths.audioDir)).toHaveLength(1);
  });
});

describe('a backup it will not open', () => {
  it('is anything that is not a zip', async () => {
    expect(await codeOf(utf8Encode('MARKERBODY is not an archive'))).toBe('not_backup');
    expect(await codeOf(new Uint8Array(0))).toBe('not_backup');
  });

  it('is an archive cut short', async () => {
    expect(await codeOf(ZIP.slice(0, ZIP.length - 100))).toBe('not_backup');
    expect(await codeOf(ZIP.slice(0, Math.floor(ZIP.length / 2)))).toBe('not_backup');
  });

  it('is a zip with no entries.json, or one from somewhere else', async () => {
    expect(await codeOf(await pack([{ name: 'photo.jpg', bytes: new Uint8Array(10) }]))).toBe(
      'not_backup',
    );
    expect(await codeOf(await withManifest((manifest) => ({ ...manifest, app: 'Other' })))).toBe(
      'not_backup',
    );
    expect(await codeOf(await withManifest(() => '[1, 2, 3]'))).toBe('not_backup');
  });

  it('is a backup another app has packed again, compressed or in a folder', async () => {
    const files = unpack(ZIP);
    const nested = await pack(files.map((file) => ({ ...file, name: `echo-export/${file.name}` })));
    expect(await codeOf(nested)).toBe('repacked');

    const compressed = ZIP.slice();
    const data = new DataView(compressed.buffer);
    const end = compressed.length - 22;
    let cursor = data.getUint32(end + 16, true);
    for (let index = 0; index < data.getUint16(end + 10, true); index += 1) {
      data.setUint16(cursor + 10, 8, true);
      data.setUint16(data.getUint32(cursor + 42, true) + 8, 8, true);
      cursor += 46 + data.getUint16(cursor + 28, true);
    }
    expect(await codeOf(compressed)).toBe('repacked');
  });

  it('is one with a name that escapes the archive, and nothing is written anywhere', async () => {
    for (const name of ['../escape.m4a', '/data/escape.m4a', 'audio/../../escape.m4a']) {
      const files = [...unpack(ZIP), { name, bytes: utf8Encode('MARKERAUDIO') }];
      const rt = await createTestRuntime();
      const opened = await open(rt, await pack(files));
      expect(opened).toMatchObject({ ok: false, code: 'unsafe' });
      expect(existsSync(join(rt.root, 'escape.m4a'))).toBe(false);
      expect(existsSync(join(rt.root, '..', 'escape.m4a'))).toBe(false);
      expect(everyStoredByte(rt.root).includes('MARKERAUDIO')).toBe(false);
    }
  });

  it('is one larger, or with more in it, than any backup can be', async () => {
    expect(await codeOf(ZIP, { archiveBytes: ZIP.length - 1 })).toBe('too_large');
    expect(await codeOf(ZIP, { manifestBytes: 100 })).toBe('too_large');
    expect(await codeOf(ZIP, { entries: 3 })).toBe('too_many');
    expect(await codeOf(ZIP, { files: 2 })).toBe('too_many');
    expect(await codeOf(ZIP, { directoryBytes: 50 })).toBe('too_many');
  });

  it('is one from a newer ECHO, refused kindly whatever it holds', async () => {
    expect(
      await codeOf(
        await withManifest(() => ({
          app: 'ECHO',
          formatVersion: BACKUP_FORMAT_VERSION + 1,
          shelves: [{ new: 'shape' }],
        })),
      ),
    ).toBe('newer');
  });

  it.each([
    ['entries.json that is not JSON', () => '{"app":"ECHO","formatVersion":1,'],
    ['a version that is not a number', (m: Manifest) => ({ ...m, formatVersion: '1' })],
    ['a version older than any', (m: Manifest) => ({ ...m, formatVersion: 0 })],
    ['a missing field', (m: Manifest) => void delete entryIn(m, 'first').mode],
    ['a field it does not know', (m: Manifest) => void (entryIn(m, 'first').secret = 'x')],
    ['an unknown status', (m: Manifest) => void (entryIn(m, 'first').status = 'archived')],
    ['an unknown mood', (m: Manifest) => void (entryIn(m, 'first').moodBefore = 'furious')],
    ['an impossible day', (m: Manifest) => void (entryIn(m, 'first').localDay = '2026-02-30')],
    ['a time that is not one', (m: Manifest) => void (entryIn(m, 'first').createdAt = 'yesterday')],
    ['a negative length', (m: Manifest) => void (entryIn(m, 'first').durationSeconds = -1)],
    ['an id with a path in it', (m: Manifest) => void (entryIn(m, 'first').id = '../first')],
    [
      'a body longer than any',
      (m: Manifest) => void (entryIn(m, 'first').body = 'x'.repeat(2_000_001)),
    ],
    ['a kept entry with no day', (m: Manifest) => void (entryIn(m, 'first').localDay = null)],
    ['a draft with a day', (m: Manifest) => void (entryIn(m, 'draft').localDay = '2026-07-01')],
    [
      'two entries with one id',
      (m: Manifest) => void m.entries.push({ ...entryIn(m, 'first'), body: 'again' }),
    ],
    [
      'a recording named for another entry',
      (m: Manifest) => void (entryIn(m, 'first').audioFile = 'audio/voice.m4a'),
    ],
  ])('is %s', async (_label, change) => {
    expect(await codeOf(await withManifest(change as (manifest: Manifest) => unknown))).toBe(
      'damaged',
    );
  });

  it('is one whose entries.json is not the one the archive recorded', async () => {
    const files = unpack(ZIP);
    const damaged = ZIP.slice();
    const manifest = files.find((file) => file.name === 'entries.json');
    const at = indexOf(damaged, manifest?.bytes ?? new Uint8Array());
    damaged[at + 40] = (damaged[at + 40] ?? 0) ^ 0x01;
    expect(await codeOf(damaged)).toBe('damaged');
  });

  it('is one that holds nothing', async () => {
    expect(await codeOf(await withManifest((manifest) => ({ ...manifest, entries: [] })))).toBe(
      'empty',
    );
  });

  it('is any backup while the journal is not open', async () => {
    const rt = await createTestRuntime();
    jest.spyOn(rt.vault, 'sealBytes').mockRejectedValue(new VaultNotReadyError());
    const opened = await open(rt, ZIP);
    expect(opened).toMatchObject({ ok: false, code: 'not_ready' });
    expect(existsSync(opened.picked)).toBe(false);
  });

  it('is a file that cannot be read', async () => {
    const rt = await createTestRuntime();
    installRuntime(rt);
    expect(await openBackup(join(rt.root, 'cache', 'DocumentPicker', 'gone.zip'))).toEqual({
      ok: false,
      code: 'unreadable',
    });
  });
});

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  return Buffer.from(haystack).indexOf(Buffer.from(needle));
}

/** `seconds` of silence as a live take keeps it: 24 kHz, mono, 16-bit PCM in a WAV. */
function wavOf(seconds: number): Uint8Array {
  const pcm = new Uint8Array(Math.round(seconds * 24_000) * 2);
  const out = new Uint8Array(44 + pcm.length);
  out.set(wavHeader({ sampleRate: 24_000, channels: 1 }, pcm.length));
  out.set(pcm, 44);
  return out;
}

/** `frames` ADTS frames of AAC at 16 kHz, mono, as Android keeps a hidden take: 1,024 samples each. */
function adtsOf(frames: number): Uint8Array {
  const length = 7 + 96;
  const out = new Uint8Array(frames * length);
  for (let index = 0; index < frames; index += 1) {
    const at = index * length;
    // Sync, MPEG-4, no CRC; AAC LC at 16 kHz (index 8); one channel; the frame's length; one block.
    out.set(
      [
        0xff,
        0xf1,
        0x60,
        0x40 | ((length >> 11) & 3),
        (length >> 3) & 0xff,
        ((length & 7) << 5) | 0x1f,
        0xfc,
      ],
      at,
    );
  }
  return out;
}

describe('a recording’s own length', () => {
  /** One spoken entry: a take of `recorded` seconds, kept in a session that ran `session` seconds. */
  async function spoken(
    recorded: number | null,
    session: number,
    extension = '.m4a',
    bytes: Uint8Array = SPOKEN,
  ): Promise<Uint8Array> {
    const rt = await createTestRuntime();
    const journal = createSqlJournal(rt, clockAt('2026-11-08T07:00:00.000Z', '2026-11-08'));
    const { recordingId } = unwrap(await journal.beginRecording('take'));
    const directory = rt.paths.recordingDirs[0] ?? '';
    mkdirSync(directory, { recursive: true });
    const uri = join(directory, `${recordingId}${extension}`);
    writeFileSync(uri, bytes);
    unwrap(
      await journal.attachRecording({
        recordingId,
        uri,
        draftId: 'take',
        durationSeconds: recorded,
        content: emptyContent({ mode: 'voice' }),
      }),
    );
    unwrap(
      await journal.commitEntry(
        'take',
        emptyContent({ mode: 'voice', body: MARK.spoken, durationSeconds: session }),
      ),
    );
    return exported(rt);
  }

  /** The same backup as an ECHO that wrote format 1 made it: no recording lengths in it. */
  async function asFormatOne(zip: Uint8Array): Promise<Uint8Array> {
    const files = unpack(zip);
    const manifest = manifestOf(files);
    manifest.formatVersion = 1;
    for (const entry of manifest.entries) delete entry.audioDurationSeconds;
    return pack(
      files.map((file) =>
        file.name === 'entries.json'
          ? { name: file.name, bytes: utf8Encode(JSON.stringify(manifest)) }
          : file,
      ),
    );
  }

  async function restoredLength(zip: Uint8Array): Promise<number | null | undefined> {
    const target = await createTestRuntime();
    expect(await restore(target, zip)).toMatchObject({ ok: true, entries: 1, withoutAudio: 0 });
    return unwrap(await sqlJournalFor(target).getEntry('take'))?.audio?.durationSeconds;
  }

  it('comes back as it was, not as the length of the session it was spoken in', async () => {
    const zip = await spoken(61, 180);
    expect(entryIn(manifestOf(unpack(zip)), 'take').audioDurationSeconds).toBe(61);
    expect(await restoredLength(zip)).toBe(61);
  });

  it('is measured from the file in an older backup that did not carry it: a live take’s WAV', async () => {
    expect(
      await restoredLength(await asFormatOne(await spoken(2.5, 180, '.wav', wavOf(2.5)))),
    ).toBe(2.5);
  });

  it('is measured from the file in an older backup: Android’s ADTS, frame by frame', async () => {
    const zip = await asFormatOne(await spoken(3, 180, '.aac', adtsOf(47)));
    expect(await restoredLength(zip)).toBeCloseTo((47 * 1024) / 16_000, 6);
  });

  it('is measured when the backup says it is not known, as for a take rescued after a crash', async () => {
    const zip = await spoken(null, 180, '.wav', wavOf(4));
    expect(entryIn(manifestOf(unpack(zip)), 'take').audioDurationSeconds).toBeNull();
    expect(await restoredLength(zip)).toBe(4);
  });

  it('falls back to the session’s length only when the file cannot be measured', async () => {
    expect(await restoredLength(await asFormatOne(await spoken(61, 180)))).toBe(180);
  });

  it('is refused when it is impossible, or given for an entry with no recording', async () => {
    const zip = await spoken(61, 180);
    for (const change of [
      (entry: Record<string, unknown>) => void (entry.audioDurationSeconds = -1),
      (entry: Record<string, unknown>) => void (entry.audioDurationSeconds = '61'),
      (entry: Record<string, unknown>) => void delete entry.audioDurationSeconds,
    ]) {
      const files = unpack(zip);
      const manifest = manifestOf(files);
      change(entryIn(manifest, 'take'));
      const changed = await pack(
        files.map((file) =>
          file.name === 'entries.json'
            ? { name: file.name, bytes: utf8Encode(JSON.stringify(manifest)) }
            : file,
        ),
      );
      expect(await codeOf(changed)).toBe('damaged');
    }
    expect(
      await codeOf(
        await withManifest(
          (manifest) => void (entryIn(manifest, 'first').audioDurationSeconds = 5),
        ),
      ),
    ).toBe('damaged');
  });
});

describe('a recording the backup does not hold whole', () => {
  async function restoredWith(files: Unpacked) {
    const target = await createTestRuntime();
    const result = await restore(target, await pack(files));
    const voice = unwrap(await sqlJournalFor(target).getEntry('voice'));
    return { target, result, voice };
  }

  it('restores the entry without it when it is missing, and says so in the count', async () => {
    const { target, result, voice } = await restoredWith(
      unpack(ZIP).filter((file) => !file.name.startsWith('audio/')),
    );
    expect(result).toEqual({
      ok: true,
      entries: 3,
      drafts: 1,
      existing: 0,
      deleted: 0,
      withoutAudio: 1,
    });
    expect(voice?.body).toBe(MARK.spoken);
    expect(voice?.audio).toBeUndefined();
    expect(target.files.list(target.paths.audioDir)).toEqual([]);
  });

  it('does the same when its bytes are damaged, and leaves none of them behind', async () => {
    // One byte changed in place, so the archive still records the checksum of the original.
    const damaged = ZIP.slice();
    const audio = unpack(ZIP).find((file) => file.name.startsWith('audio/'));
    const at = indexOf(damaged, audio?.bytes ?? new Uint8Array(1));
    expect(at).toBeGreaterThan(0);
    damaged[at + 5000] = (damaged[at + 5000] ?? 0) ^ 0xff;

    const target = await createTestRuntime();
    const result = await restore(target, damaged);
    expect(result).toMatchObject({ ok: true, entries: 3, withoutAudio: 1 });
    expect(unwrap(await sqlJournalFor(target).getEntry('voice'))?.audio).toBeUndefined();
    expect(target.files.list(target.paths.audioDir)).toEqual([]);
    expect(everyStoredByte(target.root).includes('MARKERAUDIO')).toBe(false);
  });

  it('does the same when it is empty', async () => {
    const { result, voice } = await restoredWith(
      unpack(ZIP).map((file) =>
        file.name.startsWith('audio/') ? { name: file.name, bytes: new Uint8Array(0) } : file,
      ),
    );
    expect(result).toMatchObject({ ok: true, withoutAudio: 1 });
    expect(voice?.audio).toBeUndefined();
  });
});

describe('a restore that stops part way', () => {
  it('stops at a full disk with every entry before it whole, and finishes when run again', async () => {
    const target = await createTestRuntime();
    jest.spyOn(target.vault, 'sealAudioFile').mockRejectedValueOnce(new Error('ENOSPC'));
    const opened = await open(target, ZIP);
    if (!opened.ok) throw new Error(opened.code);

    // In export order: first, voice (whose recording fails), draft, last.
    expect(await opened.backup.restore()).toEqual({
      ok: false,
      code: 'stopped',
      done: 1,
      total: 4,
      entries: 1,
      drafts: 0,
      existing: 0,
      deleted: 0,
      withoutAudio: 0,
    });
    const journal = sqlJournalFor(target);
    expect(unwrap(await journal.getEntry('first'))?.body).toBe(MARK.body);
    expect(unwrap(await journal.getEntry('voice'))).toBeNull();
    expect(target.files.list(target.paths.audioDir)).toEqual([]);
    expect(existsSync(opened.picked)).toBe(false);
    expect(tempLeft(target)).toEqual([]);

    expect(await restore(target, ZIP)).toMatchObject({
      ok: true,
      entries: 2,
      drafts: 1,
      existing: 1,
    });
    expect(await everything(target)).toEqual(await everything(SOURCE));
  });

  it('removes a sealed recording whose row never landed', async () => {
    const target = await createTestRuntime();
    const real = target.db.transaction.bind(target.db);
    let calls = 0;
    jest.spyOn(target.db, 'transaction').mockImplementation(async (task) => {
      calls += 1;
      if (calls === 2) throw new Error('disk I/O error');
      return real(task);
    });
    expect(await restore(target, ZIP)).toMatchObject({ ok: false, code: 'stopped', done: 1 });
    expect(await target.db.first('SELECT id FROM audio')).toBeNull();
    expect(target.files.list(target.paths.audioDir)).toEqual([]);
  });

  it('counts an entry whose commit landed though its answer was lost', async () => {
    const target = await createTestRuntime();
    const real = target.db.transaction.bind(target.db);
    jest.spyOn(target.db, 'transaction').mockImplementation(async (task) => {
      await real(task);
      throw new Error('the answer was lost');
    });
    expect(await restore(target, ZIP)).toMatchObject({ ok: true, entries: 3, drafts: 1 });
    expect(await everything(target)).toEqual(await everything(SOURCE));
  });

  it('says the journal is not open if the key goes', async () => {
    const target = await createTestRuntime();
    const opened = await open(target, ZIP);
    if (!opened.ok) throw new Error(opened.code);
    jest.spyOn(target.vault, 'sealJson').mockRejectedValue(new VaultNotReadyError());
    expect(await opened.backup.restore()).toMatchObject({ ok: false, code: 'not_ready', done: 0 });
  });

  it('runs once, and not after it has been let go', async () => {
    const target = await createTestRuntime();
    const opened = await open(target, ZIP);
    if (!opened.ok) throw new Error(opened.code);
    opened.backup.release();
    expect(tempLeft(target)).toEqual([]);
    expect(await opened.backup.restore()).toMatchObject({ ok: false, code: 'stopped', done: 0 });
    expect(await target.db.first('SELECT id FROM entries')).toBeNull();
  });

  describe('when the app is killed at any moment', () => {
    type Context = { files: MemoryFiles; rt: TestRuntime };

    async function setup(): Promise<Context> {
      const files = createMemoryFiles();
      return { files, rt: await createTestRuntime({ files }) };
    }

    async function relaunch({ files, rt }: Context): Promise<Context> {
      files.revive();
      const next = await rt.reopen();
      // What every launch does before anything else.
      await sqlJournalFor(next).recoverLeftovers();
      return { files, rt: next };
    }

    async function callsInCleanRestore(): Promise<number> {
      const context = await setup();
      const picked = pickerCopy(context.rt, ZIP);
      context.files.revive();
      installRuntime(context.rt);
      const opened = await openBackup(picked);
      if (!opened.ok) throw new Error(opened.code);
      expect(await opened.backup.restore()).toMatchObject({ ok: true });
      return context.files.stats.trace.length;
    }

    // Every call the restore makes to the file system, from moving the picker's copy in to letting
    // it go: reading the archive, copying the recording out, sealing it, proving it, renaming it.
    it.each([false, true])(
      'leaves each entry whole or absent, never half written, and resumes (torn writes: %s)',
      async (tearWrite) => {
        const calls = await callsInCleanRestore();
        expect(calls).toBeGreaterThan(20);
        const expected = new Map((await everything(SOURCE)).map((entry) => [entry.id, entry]));

        for (let call = 1; call <= calls; call += 1) {
          const context = await setup();
          const picked = pickerCopy(context.rt, ZIP);
          const folders: string[] = [];
          const ensure = context.files.ensureDirectory.bind(context.files);
          context.files.ensureDirectory = (directory) => {
            folders.push(directory);
            ensure(directory);
          };
          context.files.revive();
          context.files.killAt(call, { tearWrite });
          installRuntime(context.rt);
          const opened = await openBackup(picked).catch((error: unknown) => {
            if (error instanceof Killed) return null;
            throw error;
          });
          if (opened?.ok) await opened.backup.restore().catch(() => null);

          const next = await relaunch(context);
          const here = await everything(next.rt);
          // Every entry on the phone is one from the backup, complete with its recording.
          for (const entry of here) expect(entry).toEqual(expected.get(entry.id));
          const audioRows = await next.rt.db.all<{ id: string }>('SELECT id FROM audio');
          expect(
            next.files
              .list(next.rt.paths.audioDir)
              .map((file) => file.name)
              .sort(),
          ).toEqual(audioRows.map((row) => `${row.id}.enc`).sort());
          for (const folder of folders) expect(next.files.list(folder)).toEqual([]);

          // The picker's copy was moved into the space every launch clears, or was never touched.
          if (next.files.has(picked)) expectBytes(next.files.get(picked) ?? null, ZIP);

          installRuntime(next.rt);
          const again = await restore(next.rt, ZIP);
          expect(again).toMatchObject({ ok: true, existing: here.length });
          expect(await everything(next.rt)).toEqual([...expected.values()]);
        }
      },
      240_000,
    );
  });
});

describe('nothing reaches the console or a result', () => {
  const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;

  function watchConsole() {
    const spies = CONSOLE.map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    return () => spies.flatMap((spy) => spy.mock.calls);
  }

  it('through a restore, a refusal, and a stop', async () => {
    const logged = watchConsole();
    const results: unknown[] = [];
    const target = await createTestRuntime();
    results.push(await restore(target, ZIP));
    results.push(await open(await createTestRuntime(), await withManifest(() => '{"app":"ECHO",')));
    results.push(
      await open(
        await createTestRuntime(),
        await withManifest((m) => void (entryIn(m, 'first').moodBefore = MARK.body)),
      ),
    );
    const failing = await createTestRuntime();
    jest
      .spyOn(failing.db, 'run')
      .mockRejectedValue(new Error(`constraint failed near ${MARK.body}`));
    results.push(await restore(failing, ZIP));

    expect(logged()).toEqual([]);
    const text = JSON.stringify(results);
    expect(PRIVATE.filter((secret) => text.includes(secret))).toEqual([]);
    expect(results[3]).toMatchObject({ ok: false, code: 'stopped' });
  });

  // src/storage/noLeaks.test.ts reads src/services already. The restore screen lives elsewhere, so
  // its files are held to the same rules here.
  it('keeps every file of the restore free of logging, error messages and the network', () => {
    const backup = readdirSync('src/features/backup')
      .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
      .map((name) => join('src/features/backup', name));
    // The two parsers that measure an older backup's recordings read the plaintext too.
    const sources = [
      'src/services/importJournal.ts',
      'src/services/zipReader.ts',
      'src/services/wav.ts',
      'src/services/adts.ts',
      ...backup,
    ];
    expect(backup.length).toBeGreaterThanOrEqual(5);
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/\bconsole\s*\./);
      expect(source).not.toMatch(/\b(error|err|e)\.message\b/);
      expect(source).not.toMatch(/\bfetch\b|XMLHttpRequest|axios|WebSocket/);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });
});

describe('where the plaintext is', () => {
  it('is moved out of the picker’s folder into the one every launch clears, and goes at Not now', async () => {
    const target = await createTestRuntime();
    const opened = await open(target, ZIP);
    if (!opened.ok) throw new Error(opened.code);
    expect(existsSync(opened.picked)).toBe(false);
    const folders = readdirSync(target.paths.tempDir);
    expect(folders).toEqual([expect.stringMatching(/^restore-/)]);
    expect(readdirSync(childUri(target.paths.tempDir, folders[0] ?? ''))).toEqual(['backup.zip']);

    opened.backup.release();
    opened.backup.release();
    expect(tempLeft(target)).toEqual([]);
    expect(await target.db.first('SELECT id FROM entries')).toBeNull();
  });
});
