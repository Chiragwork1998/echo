import { getDocumentAsync } from 'expo-document-picker';
import { Platform } from 'react-native';

import { control } from '@/storage/testing/fakeExpoFileSystem';

import { discardPickerCopies, pickBackupFile } from './pickBackupFile';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
// The shared stand-in, with the asynchronous copy expo-file-system runs on a background thread.
jest.mock('expo-file-system', () => {
  const fake = jest.requireActual<typeof import('@/storage/testing/fakeExpoFileSystem')>(
    '@/storage/testing/fakeExpoFileSystem',
  );
  class File extends fake.File {
    async copy(destination: { uri: string }): Promise<void> {
      const bytes = fake.control.get(this.uri);
      if (!bytes) throw new Error('the provider could not be read');
      fake.control.put(destination.uri, bytes);
    }
  }
  return { ...fake, File };
});

const getDocument = jest.mocked(getDocumentAsync);
const FOLDER = 'file:///cache/DocumentPicker';
const LEFTOVER = `${FOLDER}/left-by-a-killed-restore.zip`;
const BACKUP = new Uint8Array([0x50, 0x4b, 5, 6, 1, 2, 3]);

function leaveCopy() {
  control.folders.add(FOLDER);
  control.put(LEFTOVER, new Uint8Array([1, 2, 3]));
}

const picked = (uri: string) => ({
  canceled: false as const,
  assets: [{ uri, name: 'echo-export.zip', lastModified: 0 }],
});

beforeEach(() => {
  control.reset();
  getDocument.mockReset();
});

afterEach(() => jest.restoreAllMocks());

describe('on iOS', () => {
  it('asks for one zip and uses the copy iOS made in ECHO’s own folder', async () => {
    const copy = 'file:///tmp/com.thesaturnlabs.echo-Inbox/echo-export.zip';
    getDocument.mockResolvedValue(picked(copy));
    expect(await pickBackupFile()).toEqual({ kind: 'picked', uri: copy });
    // No second copy: expo-document-picker would make one in its own folder, on the main thread.
    expect(getDocument).toHaveBeenCalledWith({
      type: ['application/zip'],
      copyToCacheDirectory: false,
      multiple: false,
    });
  });
});

describe('on Android', () => {
  const PROVIDER = 'content://com.google.android.apps.docs.storage/document/acc%3D1%3Bdoc%3D9';

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  it('accepts the other labels a provider puts on a zip', async () => {
    getDocument.mockResolvedValue({ canceled: true, assets: null });
    await pickBackupFile();
    expect(getDocument).toHaveBeenCalledWith({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      copyToCacheDirectory: false,
      multiple: false,
    });
  });

  it('copies the person’s file into ECHO’s cache, and never touches the original', async () => {
    control.put(PROVIDER, BACKUP);
    getDocument.mockResolvedValue(picked(PROVIDER));
    const result = await pickBackupFile();
    if (result.kind !== 'picked') throw new Error(result.kind);
    expect(result.uri.startsWith(`${FOLDER}/`)).toBe(true);
    expect(control.get(result.uri)).toEqual(BACKUP);
    expect(control.get(PROVIDER)).toEqual(BACKUP);
  });

  it('reports a copy that fails, and clears what it left', async () => {
    getDocument.mockImplementation(async () => {
      leaveCopy();
      return picked(PROVIDER);
    });
    expect(await pickBackupFile()).toEqual({ kind: 'failed' });
    expect(control.has(LEFTOVER)).toBe(false);
  });
});

describe('pickBackupFile', () => {
  it('says when the person closed it without choosing', async () => {
    getDocument.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickBackupFile()).toEqual({ kind: 'canceled' });
  });

  it('clears a copy a killed restore left behind before it opens', async () => {
    leaveCopy();
    getDocument.mockImplementation(async () => {
      expect(control.has(LEFTOVER)).toBe(false);
      return { canceled: true, assets: null };
    });
    await pickBackupFile();
    expect(getDocument).toHaveBeenCalled();
  });

  it('reports a picker that fails, and clears a copy it could not finish', async () => {
    getDocument.mockImplementation(async () => {
      leaveCopy();
      throw new Error('ENOSPC: the disk is full');
    });
    expect(await pickBackupFile()).toEqual({ kind: 'failed' });
    expect(control.has(LEFTOVER)).toBe(false);
  });
});

describe('discardPickerCopies', () => {
  it('removes the folder the copies wait in, and is quiet when there is none', () => {
    discardPickerCopies();
    leaveCopy();
    discardPickerCopies();
    expect(control.has(LEFTOVER)).toBe(false);
    expect(control.folders.has(FOLDER)).toBe(false);
  });
});
