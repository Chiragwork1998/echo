import { getDocumentAsync } from 'expo-document-picker';
import { Platform } from 'react-native';

import { control } from '@/storage/testing/fakeExpoFileSystem';

import { pickBackupFile } from './pickBackupFile';

let mockCopy: 'whole' | 'cut short' = 'whole';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
// The shared stand-in, with the copy expo-file-system runs on a background thread.
jest.mock('expo-file-system', () => {
  const fake = jest.requireActual<typeof import('@/storage/testing/fakeExpoFileSystem')>(
    '@/storage/testing/fakeExpoFileSystem',
  );
  class File extends fake.File {
    async copy(destination: { uri: string }): Promise<void> {
      const bytes = fake.control.get(this.uri);
      if (!bytes) throw new Error('the provider could not be read');
      if (mockCopy === 'cut short') {
        fake.control.put(destination.uri, bytes.slice(0, 2));
        throw new Error('ENOSPC: no space left on device');
      }
      fake.control.put(destination.uri, bytes);
    }
  }
  return { ...fake, File };
});
// The runtime's folder for short-lived plaintext, on the same stand-in.
jest.mock('@/storage/runtime', () => {
  const fake = jest.requireActual<typeof import('@/storage/testing/fakeExpoFileSystem')>(
    '@/storage/testing/fakeExpoFileSystem',
  );
  return {
    getRuntime: async () => ({
      files: {
        ensureDirectory: (directory: string) => fake.control.folders.add(directory),
        remove: (uri: string) => {
          const file = new fake.File(uri);
          if (file.exists) file.delete();
        },
      },
      paths: { tempDir: 'file:///cache/echo-temp' },
      newId: () => 'one',
    }),
  };
});

const getDocument = jest.mocked(getDocumentAsync);
const BACKUP = new Uint8Array([0x50, 0x4b, 5, 6, 1, 2, 3]);
const COPY = 'file:///cache/echo-temp/picked-one.zip';

const picked = (uri: string) => ({
  canceled: false as const,
  assets: [{ uri, name: 'echo-export.zip', lastModified: 0 }],
});

beforeEach(() => {
  control.reset();
  getDocument.mockReset();
  mockCopy = 'whole';
});

afterEach(() => jest.restoreAllMocks());

describe('on iOS', () => {
  it('asks for one zip and uses the copy iOS made in ECHO’s own folder', async () => {
    const copy = 'file:///tmp/com.thesaturnlabs.echo-Inbox/echo-export.zip';
    getDocument.mockResolvedValue(picked(copy));
    expect(await pickBackupFile()).toEqual({ kind: 'picked', uri: copy });
    // No second copy: expo-document-picker would make one, on the main thread.
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

  it('copies the person’s file into the folder every launch clears, and leaves theirs be', async () => {
    control.put(PROVIDER, BACKUP);
    getDocument.mockResolvedValue(picked(PROVIDER));
    expect(await pickBackupFile()).toEqual({ kind: 'picked', uri: COPY });
    expect(control.get(COPY)).toEqual(BACKUP);
    expect(control.get(PROVIDER)).toEqual(BACKUP);
  });

  it('reports a copy cut short, and deletes what it wrote', async () => {
    control.put(PROVIDER, BACKUP);
    mockCopy = 'cut short';
    getDocument.mockResolvedValue(picked(PROVIDER));
    expect(await pickBackupFile()).toEqual({ kind: 'failed' });
    expect(control.has(COPY)).toBe(false);
    expect(control.get(PROVIDER)).toEqual(BACKUP);
  });

  it('reports a provider that cannot be read', async () => {
    getDocument.mockResolvedValue(picked(PROVIDER));
    expect(await pickBackupFile()).toEqual({ kind: 'failed' });
  });
});

describe('either way', () => {
  it('says when the person closed it without choosing', async () => {
    getDocument.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickBackupFile()).toEqual({ kind: 'canceled' });
  });

  it('reports a picker that fails', async () => {
    getDocument.mockRejectedValue(new Error('a picking is already in progress'));
    expect(await pickBackupFile()).toEqual({ kind: 'failed' });
  });
});
