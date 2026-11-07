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
const TYPES =
  Platform.OS === 'android'
    ? ['application/zip', 'application/x-zip-compressed', 'application/octet-stream']
    : ['application/zip'];

const loadPicker = () => require('expo-document-picker') as typeof import('expo-document-picker');
const loadFiles = () => require('expo-file-system') as typeof import('expo-file-system');

/**
 * Removes the picker's own copies, which it makes in <cache>/DocumentPicker on both platforms. Only
 * restore uses the picker, and openBackup moves the copy it is given out of there at once, so what is
 * left is a copy a killed restore never moved, or one the picker could not finish.
 */
export function discardPickerCopies(): void {
  try {
    const { Directory, Paths } = loadFiles();
    const folder = new Directory(Paths.cache, 'DocumentPicker');
    if (folder.exists) folder.delete();
  } catch {
    // Tried again before the next pick.
  }
}

/**
 * Opens the picker for one zip, copied into the app's cache so it can be read. The copy is plaintext
 * journal content: hand it straight to openBackup, which owns it from then on.
 */
export async function pickBackupFile(): Promise<PickResult> {
  discardPickerCopies();
  try {
    const result = await loadPicker().getDocumentAsync({
      type: TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return { kind: 'canceled' };
    const asset = result.assets[0];
    return asset ? { kind: 'picked', uri: asset.uri } : { kind: 'canceled' };
  } catch {
    discardPickerCopies();
    return { kind: 'failed' };
  }
}
