/* eslint-disable @typescript-eslint/no-require-imports */
// The system's own document picker. Loaded on first use, as the other native modules are
// (src/services/nativeModules.ts), so You and its tests carry no native code until someone restores.
import { Platform } from 'react-native';

import { openSystemPicker } from '@/state/ownWindows';
import { childUri } from '@/storage/ports';
import { getRuntime } from '@/storage/runtime';

export type PickResult =
  | { kind: 'picked'; uri: string }
  | { kind: 'canceled' }
  | { kind: 'failed' }
  | { kind: 'unavailable' };

// iOS reads application/zip as the zip archive type. Android filters by MIME type, and a file's
// provider can label a zip any of these ways. The contents are checked whatever the label says.
const typesHere = () =>
  Platform.OS === 'android'
    ? ['application/zip', 'application/x-zip-compressed', 'application/octet-stream']
    : ['application/zip'];

const loadPicker = () => require('expo-document-picker') as typeof import('expo-document-picker');
const loadFiles = () => require('expo-file-system') as typeof import('expo-file-system');

/**
 * A copy of the chosen file that is ECHO's own to read, move and delete.
 *
 * iOS has made one already: the picker asks for a copy, which iOS puts in ECHO's own temporary
 * folder. Android hands over the provider's address instead, which is the person's own file and must
 * never be moved or deleted, so it is copied into the folder every launch clears, where a copy cut
 * short by a killed app does not outlive the next launch. expo-document-picker could make that copy,
 * but on the main thread, and a large backup still arriving from Google Drive would freeze ECHO until
 * Android offered to close it. expo-file-system copies on a background thread.
 */
async function ownCopy(uri: string): Promise<string> {
  if (Platform.OS === 'ios') return uri;
  const { File } = loadFiles();
  const { files, paths, newId } = await getRuntime();
  files.ensureDirectory(paths.tempDir);
  const copy = childUri(paths.tempDir, `picked-${newId()}.zip`);
  try {
    await new File(uri).copy(new File(copy));
  } catch (error) {
    try {
      files.remove(copy);
    } catch {
      // The next launch clears the folder.
    }
    throw error;
  }
  return copy;
}

/**
 * Opens the picker for one zip, and returns a plaintext copy of it that ECHO owns: hand it straight to
 * openBackup, which takes it from there. The person's own file is only ever read.
 */
export async function pickBackupFile(): Promise<PickResult> {
  // The picker is another Activity, which takes the app out of the active state while it is on top.
  // The privacy cover is not raised for it, and the moment it has answered it is lifted if it was.
  // Closed before the file is copied, so that the work on the file never has the cover to wait for.
  const closePicker = openSystemPicker();
  try {
    let result: Awaited<ReturnType<ReturnType<typeof loadPicker>['getDocumentAsync']>>;
    try {
      result = await loadPicker().getDocumentAsync({
        type: typesHere(),
        // ECHO makes its own copy, off the main thread. See ownCopy.
        copyToCacheDirectory: false,
        multiple: false,
      });
    } finally {
      closePicker();
    }
    if (result.canceled) return { kind: 'canceled' };
    const asset = result.assets[0];
    if (!asset) return { kind: 'canceled' };
    return { kind: 'picked', uri: await ownCopy(asset.uri) };
  } catch {
    return { kind: 'failed' };
  }
}
