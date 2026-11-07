// The whole of Restore from a backup as a person meets it: the row in Your data, the system picker
// (stood in for here), and the sheet. Behind it is the real import, the real vault and a real
// database, so "restored" means the entries are in the journal.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { emptyContent } from '@/features/journal/content';
import { sqlJournalFor } from '@/features/journal/runtime';
import type { JournalResult } from '@/features/journal/types';
import { Section } from '@/features/tab-pages/parts';
import { openBackup, type OpenFailure } from '@/services/importJournal';
import { createZipWriter } from '@/services/zip';
import { useGate } from '@/state/gate';
import { utf8Encode } from '@/storage/bytes';
import type { FileWriter } from '@/storage/ports';
import { installRuntime } from '@/storage/runtime';
import { createTestRuntime, type TestRuntime } from '@/storage/testing/nodePorts';
import { render } from '@/testing/render';

import { pickBackupFile, type PickResult } from './pickBackupFile';
import { restoreCopy } from './restoreCopy';
import { RestoreRow } from './RestoreRow';

jest.mock('./pickBackupFile', () => ({ pickBackupFile: jest.fn() }));
jest.mock('@/services/importJournal', () => {
  const actual = jest.requireActual('@/services/importJournal');
  return { ...actual, openBackup: jest.fn(actual.openBackup) };
});
jest.mock('@/services/biometric', () => ({
  authenticate: jest.fn(),
  getLockMethod: jest.fn(async () => 'biometric'),
}));

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

const pick = jest.mocked(pickBackupFile);
const open = jest.mocked(openBackup);
const THIS_YEAR = new Date().getFullYear();

type ManifestEntry = Record<string, unknown>;

/** One synthetic entry exactly as exportJournal writes it. */
const entry = (id: string, patch: ManifestEntry = {}): ManifestEntry => ({
  id,
  status: 'committed',
  createdAt: '2026-03-03T08:00:00.000Z',
  committedAt: '2026-03-03T08:00:00.000Z',
  localDay: '2026-03-03',
  title: null,
  body: 'Synthetic words written for a test',
  mode: 'text',
  moodBefore: null,
  promptId: null,
  prompt: null,
  durationSeconds: 60,
  audioFile: null,
  reflection: null,
  ...patch,
});

const AUDIO = Uint8Array.from({ length: 64_000 }, (_, index) => (index * 7) % 256);

const ENTRIES = [
  entry('a'),
  entry('b', {
    mode: 'voice',
    createdAt: '2026-06-10T19:30:00.000Z',
    committedAt: '2026-06-10T19:30:00.000Z',
    localDay: '2026-06-10',
    audioFile: 'audio/b.m4a',
  }),
  entry('c', {
    createdAt: '2026-11-08T20:00:00.000Z',
    committedAt: '2026-11-08T20:00:00.000Z',
    localDay: '2026-11-08',
  }),
];

/** A backup as exportJournal lays one out: entries.json, a recording, entries.md. */
async function backup(
  entries: ManifestEntry[] = ENTRIES,
  { audio = true }: { audio?: boolean } = {},
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const sink: FileWriter = { write: async (bytes) => void chunks.push(bytes.slice()), close() {} };
  const zip = createZipWriter(sink, new Date(2026, 10, 8));
  if (audio) await zip.add('audio/b.m4a', AUDIO);
  const manifest = {
    app: 'ECHO',
    formatVersion: 1,
    exportedAt: '2026-11-08T21:00:00.000Z',
    entries,
  };
  await zip.add('entries.json', utf8Encode(JSON.stringify(manifest, null, 2)));
  await zip.add('entries.md', utf8Encode('# ECHO journal'));
  await zip.finish();
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  chunks.reduce((at, chunk) => (out.set(chunk, at), at + chunk.length), 0);
  return out;
}

let rt: TestRuntime;

/** The picker's copy, where expo-document-picker leaves it. */
function pickerCopy(bytes: Uint8Array): string {
  const uri = join(rt.root, 'cache', 'DocumentPicker', `${randomUUID()}.zip`);
  mkdirSync(dirname(uri), { recursive: true });
  writeFileSync(uri, bytes);
  return uri;
}

async function picks(bytes: Uint8Array): Promise<string> {
  const uri = pickerCopy(bytes);
  pick.mockResolvedValueOnce({ kind: 'picked', uri });
  return uri;
}

const row = () => screen.getByRole('button', { name: new RegExp(restoreCopy.row) });
const button = (name: string) => screen.getByRole('button', { name });
const tempLeft = () =>
  existsSync(rt.paths.tempDir) ? readdirSync(rt.paths.tempDir, { recursive: true }) : [];

const preview = (entries = 3, firstDay = '2026-03-03', lastDay = '2026-11-08') =>
  restoreCopy.preview({ entries, drafts: 0, firstDay, lastDay }, THIS_YEAR);

async function show() {
  await render(
    <Section title="Your data">
      <RestoreRow />
    </Section>,
  );
}

const lock = () =>
  act(() =>
    useGate.setState({
      lock: { kind: 'locked', method: 'biometric', failure: null, canDisable: false },
    }),
  );
const unlock = () => act(() => useGate.setState({ lock: { kind: 'unlocked' } }));

beforeEach(async () => {
  jest.clearAllMocks();
  useGate.setState({ lock: { kind: 'unlocked' } });
  rt = await createTestRuntime();
  installRuntime(rt);
});

afterEach(() => {
  installRuntime(null);
  jest.restoreAllMocks();
});

describe('the row', () => {
  it('sits in Your data as one row that opens the picker', async () => {
    await show();
    expect(row()).toBeTruthy();
    expect(screen.getByText(restoreCopy.rowDetail)).toBeTruthy();
    let answer: (result: PickResult) => void = () => undefined;
    pick.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

    await fireEvent.press(row());
    expect(pick).toHaveBeenCalledTimes(1);
    expect(screen.getByText(restoreCopy.reading)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reading your backup/ })).toBeDisabled();

    await act(async () => answer({ kind: 'canceled' }));
    expect(screen.getByText(restoreCopy.row)).toBeTruthy();
    expect(screen.queryByTestId('restore-sheet')).toBeNull();
  });

  it('opens nothing while the journal is locked', async () => {
    await show();
    await lock();
    await fireEvent.press(row());
    expect(pick).not.toHaveBeenCalled();
  });
});

describe('a backup restored', () => {
  it('is previewed, restored, and reported, with its plaintext gone', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await show();
    const picked = await picks(await backup());
    await fireEvent.press(row());

    expect(await screen.findByText(preview())).toBeTruthy();
    expect(screen.getByText(restoreCopy.previewNote)).toBeTruthy();
    expect(screen.getByRole('header', { name: restoreCopy.title })).toBeTruthy();
    // Read and checked, and nothing written yet.
    expect(await rt.db.first('SELECT id FROM entries')).toBeNull();
    expect(existsSync(picked)).toBe(false);

    await fireEvent.press(button(restoreCopy.restore));
    const done = restoreCopy.done({
      entries: 3,
      drafts: 0,
      existing: 0,
      deleted: 0,
      withoutAudio: 0,
    });
    expect(await screen.findByText(done)).toBe(screen.getByText('3 entries restored.'));
    expect(announce).toHaveBeenCalledWith(done);

    const listed = await sqlJournalFor(rt).listEntries();
    expect(listed.ok && listed.value.map((item) => item.id)).toEqual(['c', 'b', 'a']);
    expect(tempLeft()).toEqual([]);

    await fireEvent.press(button(restoreCopy.doneAction));
    expect(screen.queryByTestId('restore-sheet')).toBeNull();
    expect(screen.getByText(restoreCopy.row)).toBeTruthy();
  });

  it('shows its progress, and cannot be closed while it restores', async () => {
    let finish: () => void = () => undefined;
    const real = rt.vault.sealAudioFile.bind(rt.vault);
    jest.spyOn(rt.vault, 'sealAudioFile').mockImplementation(async (...args) => {
      await new Promise<void>((resolve) => (finish = resolve));
      return real(...args);
    });
    await show();
    await picks(await backup());
    await fireEvent.press(row());
    await fireEvent.press(await screen.findByRole('button', { name: restoreCopy.restore }));

    expect(await screen.findByText(restoreCopy.restoring(1, 3))).toBeTruthy();
    expect(screen.getByText(restoreCopy.keepOpen)).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 3, now: 1 });
    expect(screen.queryByRole('button', { name: restoreCopy.notNow })).toBeNull();
    // The system Back button does nothing until it is done.
    await fireEvent(screen.getByTestId('restore-sheet'), 'requestClose');
    expect(screen.getByText(restoreCopy.restoring(1, 3))).toBeTruthy();

    await act(async () => finish());
    expect(
      await screen.findByText(
        restoreCopy.done({ entries: 3, drafts: 0, existing: 0, deleted: 0, withoutAudio: 0 }),
      ),
    ).toBeTruthy();
  });

  it('says which were already here', async () => {
    unwrap(await sqlJournalFor(rt).commitEntry('a', emptyContent({ body: 'written here' })));
    await show();
    await picks(await backup());
    await fireEvent.press(row());
    await fireEvent.press(await screen.findByRole('button', { name: restoreCopy.restore }));
    expect(
      await screen.findByText('2 entries restored. 1 was already on this phone.'),
    ).toBeTruthy();
  });

  it('says which came back without a recording the backup did not have', async () => {
    await show();
    await picks(await backup(ENTRIES, { audio: false }));
    await fireEvent.press(row());
    await fireEvent.press(await screen.findByRole('button', { name: restoreCopy.restore }));
    expect(
      await screen.findByText(
        '3 entries restored. 1 came back without its recording, because the backup didn’t have it.',
      ),
    ).toBeTruthy();
  });

  it('writes nothing at Not now, and deletes its copy of the file', async () => {
    await show();
    await picks(await backup());
    await fireEvent.press(row());
    await fireEvent.press(await screen.findByRole('button', { name: restoreCopy.notNow }));

    expect(screen.queryByTestId('restore-sheet')).toBeNull();
    expect(tempLeft()).toEqual([]);
    expect(await rt.db.first('SELECT id FROM entries')).toBeNull();
  });

  it('treats Back on the preview as Not now', async () => {
    await show();
    await picks(await backup());
    await fireEvent.press(row());
    await screen.findByText(preview());
    await fireEvent(screen.getByTestId('restore-sheet'), 'requestClose');
    expect(screen.queryByTestId('restore-sheet')).toBeNull();
    expect(tempLeft()).toEqual([]);
  });

  it('lets the copy go if You closes while it is only being looked at', async () => {
    const view = await render(<RestoreRow />);
    await picks(await backup());
    await fireEvent.press(row());
    await screen.findByText(preview());
    expect(tempLeft()).not.toEqual([]);
    await view.unmount();
    expect(tempLeft()).toEqual([]);
  });
});

describe('a restore that stops part way', () => {
  it('says what to do, and choosing the file again adds the rest', async () => {
    jest.spyOn(rt.vault, 'sealAudioFile').mockRejectedValueOnce(new Error('ENOSPC'));
    await show();
    await picks(await backup());
    await fireEvent.press(row());
    await fireEvent.press(await screen.findByRole('button', { name: restoreCopy.restore }));

    expect(await screen.findByText(restoreCopy.stopped(1, 3))).toBeTruthy();
    expect(tempLeft()).toEqual([]);
    await picks(await backup());
    await fireEvent.press(button(restoreCopy.chooseAgain));
    await fireEvent.press(await screen.findByRole('button', { name: restoreCopy.restore }));
    expect(
      await screen.findByText('2 entries restored. 1 was already on this phone.'),
    ).toBeTruthy();
    const listed = await sqlJournalFor(rt).listEntries();
    expect(listed.ok && listed.value).toHaveLength(3);
  });
});

describe('a file it will not restore', () => {
  const ANOTHER: OpenFailure[] = [
    'not_backup',
    'repacked',
    'unsafe',
    'too_large',
    'too_many',
    'damaged',
    'empty',
  ];

  it.each(ANOTHER)('says so plainly (%s), and offers another file', async (code) => {
    await show();
    await picks(await backup());
    open.mockResolvedValueOnce({ ok: false, code });
    await fireEvent.press(row());

    expect(await screen.findByText(restoreCopy.failed[code])).toBeTruthy();
    expect(button(restoreCopy.chooseAnother)).toBeTruthy();
    await fireEvent.press(button(restoreCopy.close));
    expect(screen.queryByTestId('restore-sheet')).toBeNull();
  });

  it.each(['unreadable', 'not_ready'] as const)(
    'offers to try again when it may pass (%s)',
    async (code) => {
      await show();
      await picks(await backup());
      open.mockResolvedValueOnce({ ok: false, code });
      await fireEvent.press(row());
      expect(await screen.findByText(restoreCopy.failed[code])).toBeTruthy();
      pick.mockResolvedValueOnce({ kind: 'canceled' });
      await fireEvent.press(button(restoreCopy.tryAgain));
      expect(pick).toHaveBeenCalledTimes(2);
    },
  );

  it('refuses the real thing kindly: a newer backup, read on this phone', async () => {
    await show();
    const chunks: Uint8Array[] = [];
    const sink: FileWriter = {
      write: async (bytes) => void chunks.push(bytes.slice()),
      close() {},
    };
    const zip = createZipWriter(sink, new Date(2026, 10, 8));
    await zip.add('entries.json', utf8Encode('{"app":"ECHO","formatVersion":2}'));
    await zip.finish();
    const uri = await picks(Buffer.concat(chunks));
    await fireEvent.press(row());
    expect(
      await screen.findByText(
        'This backup is from a newer version of ECHO. Update ECHO, then try again.',
      ),
    ).toBeTruthy();
    expect(existsSync(uri)).toBe(false);
    // Another file will not help. The one way on is out.
    expect(screen.queryByRole('button', { name: restoreCopy.chooseAnother })).toBeNull();
    await fireEvent.press(button(restoreCopy.close));
    expect(screen.queryByTestId('restore-sheet')).toBeNull();
  });

  it('says when the picker itself could not open, and tries again', async () => {
    await show();
    pick.mockResolvedValueOnce({ kind: 'failed' });
    await fireEvent.press(row());
    expect(await screen.findByText(restoreCopy.failed.picker)).toBeTruthy();
    pick.mockResolvedValueOnce({ kind: 'canceled' });
    await fireEvent.press(button(restoreCopy.tryAgain));
    expect(pick).toHaveBeenCalledTimes(2);
    expect(open).not.toHaveBeenCalled();
  });

  it('says where restoring is not available, with only a way out', async () => {
    await show();
    pick.mockResolvedValueOnce({ kind: 'unavailable' });
    await fireEvent.press(row());
    expect(await screen.findByText(restoreCopy.failed.unavailable)).toBeTruthy();
    expect(screen.queryByRole('button', { name: restoreCopy.chooseAnother })).toBeNull();
    await fireEvent.press(button(restoreCopy.close));
    expect(screen.queryByTestId('restore-sheet')).toBeNull();
  });
});

describe('the lock', () => {
  it('hides the sheet while the journal is locked, and keeps the backup for after', async () => {
    await show();
    await picks(await backup());
    await fireEvent.press(row());
    await screen.findByText(preview());

    await lock();
    expect(screen.queryByTestId('restore-sheet')).toBeNull();
    expect(tempLeft()).not.toEqual([]);

    await unlock();
    await fireEvent.press(await screen.findByRole('button', { name: restoreCopy.restore }));
    expect(await screen.findByText('3 entries restored.')).toBeTruthy();
  });

  it('shows a preview that arrives while locked only once unlocked', async () => {
    await show();
    let answer: (result: PickResult) => void = () => undefined;
    pick.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await fireEvent.press(row());
    // Long enough away in the picker that the journal locked behind it.
    await lock();
    const uri = pickerCopy(await backup());
    await act(async () => answer({ kind: 'picked', uri }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(screen.queryByText(preview())).toBeNull();

    await unlock();
    expect(await screen.findByText(preview())).toBeTruthy();
  });
});
