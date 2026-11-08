import { qa } from '@/testing/qa';

import type { ExportResult } from './exportJournal';

export type { ExportResult } from './exportJournal';

// Web is a preview with no storage. The visual harness can make the export take its time
// (`?lag=ms`) to see the row at work.
export const exportJournal = async (): Promise<ExportResult> => {
  if (qa.lag) await new Promise((resolve) => setTimeout(resolve, qa.lag));
  return { ok: false, code: 'unavailable' };
};
