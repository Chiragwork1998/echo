import type { PickResult } from './pickBackupFile';

export type { PickResult } from './pickBackupFile';

// Web is a preview with no storage: there is nothing to restore into, so no file is asked for.
export const pickBackupFile = async (): Promise<PickResult> => ({ kind: 'unavailable' });
