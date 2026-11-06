import type { ExportResult } from './exportJournal';

export type { ExportResult } from './exportJournal';

export const exportJournal = async (): Promise<ExportResult> => ({
  ok: false,
  code: 'unavailable',
});
