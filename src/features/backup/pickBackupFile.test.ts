import { getDocumentAsync } from 'expo-document-picker';

import { control } from '@/storage/testing/fakeExpoFileSystem';

import { discardPickerCopies, pickBackupFile } from './pickBackupFile';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => jest.requireActual('@/storage/testing/fakeExpoFileSystem'));

const getDocument = jest.mocked(getDocumentAsync);
const FOLDER = 'file:///cache/DocumentPicker';
const LEFTOVER = `${FOLDER}/left-by-a-killed-restore.zip`;

function leaveCopy() {
  control.folders.add(FOLDER);
  control.put(LEFTOVER, new Uint8Array([1, 2, 3]));
}

beforeEach(() => {
  control.reset();
  getDocument.mockReset();
});

describe('pickBackupFile', () => {
  it('asks for one zip, copied where ECHO can read it, and hands back its address', async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: `${FOLDER}/picked.zip`, name: 'echo-export.zip', lastModified: 0 }],
    });
    expect(await pickBackupFile()).toEqual({ kind: 'picked', uri: `${FOLDER}/picked.zip` });
    expect(getDocument).toHaveBeenCalledWith({
      type: ['application/zip'],
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  it('accepts the other labels an Android provider puts on a zip', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
      const android = jest.requireActual<typeof import('./pickBackupFile')>('./pickBackupFile');
      getDocument.mockResolvedValue({ canceled: true, assets: null });
      void android.pickBackupFile();
    });
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      }),
    );
  });

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
  it('removes the picker’s folder, and is quiet when there is none', () => {
    discardPickerCopies();
    leaveCopy();
    discardPickerCopies();
    expect(control.has(LEFTOVER)).toBe(false);
    expect(control.folders.has(FOLDER)).toBe(false);
  });
});
