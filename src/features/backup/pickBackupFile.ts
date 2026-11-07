/* eslint-disable @typescript-eslint/no-require-imports */
// The system's own document picker. Loaded on first use, as the other native modules are
// (src/services/nativeModules.ts), so You and its tests carry no native code until someone restores.
import { Platform } from 'react-native';

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

/** Where ECHO's copy of a chosen file waits for openBackup, which moves it on at once. */
const FOLDER = 'DocumentPicker';

const loadPicker = () => require('expo-document-picker') as typeof import('expo-document-picker');
const loadFiles = () => require('expo-file-system') as typeof import('expo-file-system');

/**
 * Removes <cache>/DocumentPicker, the folder the copies wait in. Only restore uses it, and openBackup
 * moves a copy out of it at once, so what is left is a copy a killed restore never moved, or one cut
 * short by a full disk.
 */
export function discardPickerCopies(): void {
  try {
    const { Directory, Paths } = loadFiles();
    const folder = new Directory(Paths.cache, FOLDER);
    if (folder.exists) folder.delete();
  } catch {
    // Tried again before the next pick.
  }
}

/**
 * A copy of the chosen file that is ECHO's own to read, move and delete. iOS has already made one:
 * the picker asks for a copy, which iOS puts in ECHO's own temporary folder. Android hands over the
 * provider's address instead, which is the person's own file and must never be moved or deleted, so
 * it is copied here. expo-document-picker could copy it too, but does it on the main thread, and a
 * large backup still arriving from Google Drive would freeze ECHO until Android offered to close it.
 * expo-file-system copies on a background thread.
 */
async function ownCopy(uri: string): Promise<string> {
  if (Platform.OS === 'ios') return uri;
  const { Directory, File, Paths } = loadFiles();
  const folder = new Directory(Paths.cache, FOLDER);
  folder.create({ idempotent: true, intermediates: true });
  const copy = new File(
    folder,
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}.zip`,
  );
  await new File(uri).copy(copy);
  return copy.uri;
}

/**
 * Opens the picker for one zip, and returns a plaintext copy of it that ECHO owns: hand it straight to
 * openBackup, which takes it from there. The person's own file is only ever read.
 */
export async function pickBackupFile(): Promise<PickResult> {
  discardPickerCopies();
  try {
    const result = await loadPicker().getDocumentAsync({
      type: typesHere(),
      copyToCacheDirectory: false,
      multiple: false,
    });
    if (result.canceled) return { kind: 'canceled' };
    const asset = result.assets[0];
    if (!asset) return { kind: 'canceled' };
    return { kind: 'picked', uri: await ownCopy(asset.uri) };
  } catch {
    discardPickerCopies();
    return { kind: 'failed' };
  }
}
