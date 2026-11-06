import example from '@handoff/data/example-content.json';

import { qa } from '@/testing/qa';

import { emptyContent } from './content';
import { addDays, deviceClock, type Clock } from './localDay';
import { createMemoryJournal, type MemorySeed } from './memoryJournal';
import type { SqlJournal } from './sqlJournal';
import type { Entry, Journal } from './types';

// The goldens are drawn on a Thursday with Monday to Thursday complete. Holding the clock there keeps
// the harness deterministic. Example text comes from the handoff, never from anything real.
const QA_MOMENT = new Date(2026, 10, 5, 9, 41);
const qaClock: Clock = { ...deviceClock, now: () => QA_MOMENT };

function qaSeed(): MemorySeed {
  if (qa.fixture !== 'home' && qa.fixture !== 'completion') return {};
  const today = qaClock.localDay(QA_MOMENT);
  const at = QA_MOMENT.getTime();
  const entry = (id: string, offset: number, patch: Partial<Entry>): Entry => ({
    ...emptyContent(),
    id,
    status: 'committed',
    createdAt: at + offset,
    updatedAt: at + offset,
    committedAt: at + offset,
    localDay: addDays(today, offset),
    ...patch,
  });
  const { recent, draft } = example.home;
  const recentContent = {
    title: recent.title,
    body: recent.excerpt,
    durationSeconds: recent.durationMinutes * 60,
  };
  const first = example.firstEntry;
  return {
    entries: [
      entry('qa-1', -3, { body: example.firstEntry.prompt }),
      entry('qa-2', -2, { body: example.firstEntry.prompt }),
      // The newest commit, so that Home shows it as recent, as in the golden.
      entry('qa-3', -1, { ...recentContent, committedAt: at + 1 }),
      entry('qa-4', 0, { body: first.prompt, durationSeconds: first.durationMinutes * 60 }),
      {
        ...emptyContent({ title: draft.title, body: draft.title }),
        id: 'qa-draft',
        status: 'draft',
        durationSeconds: (7 - draft.minutesRemaining) * 60,
        createdAt: at,
        updatedAt: at,
      },
    ],
    reflections: { 'qa-3': { status: 'complete', text: first.reflection } },
  };
}

let journal: Journal | null = null;

/** Web holds everything in memory for one page load. Nothing is written anywhere. */
export async function getJournal(): Promise<Journal> {
  journal ??= createMemoryJournal(qaSeed(), qa.enabled ? qaClock : deviceClock);
  return journal;
}

export function setJournal(next: Journal | null): void {
  journal = next;
}

/** Never reached: the gate is bypassed on web and export and delete-all have web variants. */
export function sqlJournalFor(): SqlJournal {
  throw new Error('storage is unavailable on web');
}
