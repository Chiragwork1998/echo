import { getRuntime, type Runtime } from '@/storage/runtime';

import { deviceClock } from './localDay';
import { createSqlJournal, type SqlJournal } from './sqlJournal';
import type { Journal } from './types';

let override: Journal | null = null;
let cached: { runtime: Runtime; journal: SqlJournal } | null = null;

/** One journal per runtime, so its write queue really is the only writer. */
export function sqlJournalFor(runtime: Runtime): SqlJournal {
  if (cached?.runtime !== runtime) {
    cached = { runtime, journal: createSqlJournal(runtime, deviceClock) };
  }
  return cached.journal;
}

export async function getJournal(): Promise<Journal> {
  return override ?? sqlJournalFor(await getRuntime());
}

/** Replaces the journal in tests. Pass createMemoryJournal(), and null to restore. */
export function setJournal(journal: Journal | null): void {
  override = journal;
}
