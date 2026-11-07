import type { OpenResult } from './importJournal';

export type {
  BackupSummary,
  OpenedBackup,
  OpenFailure,
  OpenResult,
  RestoreCounts,
  RestoreResult,
} from './importJournal';

// Web is a preview with no storage, so there is nothing to restore into.
export const openBackup = async (): Promise<OpenResult> => ({ ok: false, code: 'unavailable' });
