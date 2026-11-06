import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32 as nodeCrc32 } from 'node:zlib';

import { AppState } from 'react-native';

import { emptyContent } from '@/features/journal/content';
import { sqlJournalFor } from '@/features/journal/runtime';
import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, type TestRuntime } from '@/storage/testing/nodePorts';

import { exportJournal } from './exportJournal';
import { crc32 } from './zip';

type ZipFile = { name: string; bytes: Buffer; crc: number };

/** An independent reader, walking the central directory as an unzip tool does. */
function readZip(zip: Buffer): ZipFile[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(-1);
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const files: ZipFile[] = [];
  for (let index = 0; index < count; index += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(cursor + 16);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const local = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26);
    files.push({ name, bytes: zip.subarray(start, start + size), crc });
    cursor += 46 + nameLength;
  }
  return files;
}

let rt: TestRuntime;
let shared: ZipFile[] | null;

const share = {
  isAvailable: async () => true,
  share: async (uri: string) => {
    shared = readZip(readFileSync(uri));
  },
};

const file = (name: string) => shared?.find((item) => item.name === name);

async function addVoice(id: string, audio: string) {
  const journal = sqlJournalFor(rt);
  const begun = await journal.beginRecording(id);
  if (!begun.ok) throw new Error('begin failed');
  const directory = rt.paths.recordingDirs[0] ?? '';
  mkdirSync(directory, { recursive: true });
  const uri = join(directory, `${begun.value.recordingId}.m4a`);
  writeFileSync(uri, audio);
  await journal.attachRecording({
    recordingId: begun.value.recordingId,
    uri,
    draftId: id,
    durationSeconds: 3,
    content: emptyContent({ mode: 'voice' }),
  });
  await journal.commitEntry(id, emptyContent({ mode: 'voice', body: 'spoken' }));
}

beforeEach(async () => {
  shared = null;
  rt = await createTestRuntime();
  installRuntime(rt);
});

afterEach(() => installRuntime(null));

describe('exportJournal', () => {
  it('shares JSON, Markdown, and the original audio in one archive', async () => {
    const journal = sqlJournalFor(rt);
    await journal.commitEntry(
      'text',
      emptyContent({
        title: 'A title',
        body: 'Written with मैं and 🌊',
        moodBefore: 'heavy',
        promptText: 'What is here?',
      }),
    );
    await journal.saveReflection('text', { status: 'complete', text: 'A kept reflection' });
    await addVoice('voice', 'original-audio-bytes');

    expect(await exportJournal(share, 0)).toEqual({ ok: true, exported: 2, unreadable: 0 });

    expect(shared?.map((item) => item.name).sort()).toEqual([
      'audio/voice.m4a',
      'entries.json',
      'entries.md',
    ]);
    expect(file('audio/voice.m4a')?.bytes.toString()).toBe('original-audio-bytes');

    const json = JSON.parse(file('entries.json')?.bytes.toString() ?? '{}');
    expect(json.formatVersion).toBe(1);
    const exported = json.entries.find((item: { id: string }) => item.id === 'text');
    expect(exported).toMatchObject({
      title: 'A title',
      body: 'Written with मैं and 🌊',
      moodBefore: 'heavy',
      prompt: 'What is here?',
      reflection: 'A kept reflection',
    });
    const voice = json.entries.find((item: { id: string }) => item.id === 'voice');
    expect(voice.audioFile).toBe('audio/voice.m4a');

    const markdown = file('entries.md')?.bytes.toString() ?? '';
    expect(markdown).toContain('Written with मैं and 🌊');
    expect(markdown).toContain('**A title**');
    expect(markdown).toContain('audio/voice.m4a');
  });

  it('writes valid checksums', async () => {
    await addVoice('voice', 'audio');
    await exportJournal(share, 0);
    for (const item of shared ?? []) expect(item.crc).toBe(nodeCrc32(item.bytes));
  });

  it('includes drafts, marked as drafts', async () => {
    await sqlJournalFor(rt).saveDraft('d', emptyContent({ body: 'unfinished' }));
    await exportJournal(share, 0);
    const json = JSON.parse(file('entries.json')?.bytes.toString() ?? '{}');
    expect(json.entries[0]).toMatchObject({ status: 'draft', body: 'unfinished' });
    expect(file('entries.md')?.bytes.toString()).toContain('_Draft_');
  });

  it('leaves out deleted entries', async () => {
    const journal = sqlJournalFor(rt);
    await journal.commitEntry('gone', emptyContent({ body: 'deleted words' }));
    await journal.deleteEntry('gone');
    await exportJournal(share, 0);
    expect(file('entries.json')?.bytes.toString()).not.toContain('deleted words');
  });

  it('removes the plaintext archive once shared', async () => {
    let path = '';
    await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'x' }));
    await exportJournal({ ...share, share: async (uri) => void (path = uri) }, 0);
    expect(path).not.toBe('');
    expect(existsSync(path)).toBe(false);
    expect(rt.files.list(rt.paths.tempDir)).toEqual([]);
  });

  it('keeps it briefly for an Android app still reading, then removes it', async () => {
    jest.useFakeTimers();
    let path = '';
    await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'x' }));
    await exportJournal({ ...share, share: async (uri) => void (path = uri) }, 60_000);
    expect(existsSync(path)).toBe(true);
    jest.advanceTimersByTime(60_000);
    expect(existsSync(path)).toBe(false);
    jest.useRealTimers();
  });

  describe('on Android, where timers stop while the app is in the background', () => {
    const WINDOW_MS = 60_000;
    let handlers: ((state: string) => void)[];
    let unsubscribed: number;
    let path: string;

    const send = (state: string) => handlers.forEach((handler) => handler(state));

    beforeEach(async () => {
      jest.useFakeTimers();
      handlers = [];
      unsubscribed = 0;
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
        handlers.push(handler as (state: string) => void);
        return { remove: () => (unsubscribed += 1) } as unknown as ReturnType<
          typeof AppState.addEventListener
        >;
      });
      await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'x' }));
      await exportJournal({ ...share, share: async (uri) => void (path = uri) }, WINDOW_MS);
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    /** Time passes on the clock, and the timer does not run: what a paused app sees. */
    const awayFor = (ms: number) => jest.setSystemTime(Date.now() + ms);

    it('removes it on return once the window has passed, with the timer never having run', () => {
      send('background');
      awayFor(WINDOW_MS * 10);
      expect(existsSync(path)).toBe(true);
      send('active');
      expect(existsSync(path)).toBe(false);
    });

    it('leaves it for the receiving app on a return inside the window', () => {
      send('background');
      awayFor(WINDOW_MS / 6);
      send('active');
      expect(existsSync(path)).toBe(true);
      jest.advanceTimersByTime(WINDOW_MS);
      expect(existsSync(path)).toBe(false);
    });

    it('does nothing on the way out', () => {
      awayFor(WINDOW_MS);
      send('inactive');
      send('background');
      expect(existsSync(path)).toBe(true);
    });

    it('stops listening once it is done, however it got there', () => {
      jest.advanceTimersByTime(WINDOW_MS);
      expect(unsubscribed).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('cancels the timer when the return does the removing', () => {
      awayFor(WINDOW_MS);
      send('active');
      expect(unsubscribed).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('is removed by the next launch if the process dies first', async () => {
      await sqlJournalFor(rt).recoverLeftovers();
      expect(existsSync(path)).toBe(false);
    });
  });

  it('removes the archive if sharing fails', async () => {
    let path = '';
    const result = await exportJournal(
      {
        ...share,
        share: async (uri) => {
          path = uri;
          throw new Error('cancelled');
        },
      },
      60_000,
    );
    expect(result).toEqual({ ok: false, code: 'failed' });
    expect(existsSync(path)).toBe(false);
  });

  it('counts unreadable entries instead of failing the export', async () => {
    const journal = sqlJournalFor(rt);
    await journal.commitEntry('good', emptyContent({ body: 'readable' }));
    await journal.commitEntry('bad', emptyContent({ body: 'corrupted' }));
    await rt.db.exec(`UPDATE entries SET sealed = x'01' WHERE id = 'bad'`);
    expect(await exportJournal(share, 0)).toEqual({ ok: true, exported: 1, unreadable: 1 });
  });

  it('reports no share sheet without building anything', async () => {
    const result = await exportJournal({ ...share, isAvailable: async () => false }, 0);
    expect(result).toEqual({ ok: false, code: 'unavailable' });
    expect(existsSync(rt.paths.tempDir)).toBe(false);
  });

  it('never changes the journal', async () => {
    const journal = sqlJournalFor(rt);
    await journal.commitEntry('a', emptyContent({ body: 'still here' }));
    await exportJournal(share, 0);
    const entry = await journal.getEntry('a');
    expect(entry.ok && entry.value?.body).toBe('still here');
  });
});

describe('crc32', () => {
  it('agrees with zlib', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => (index * 31) % 251);
    expect(crc32(bytes)).toBe(nodeCrc32(bytes));
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});
