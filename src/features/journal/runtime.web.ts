import example from '@handoff/data/example-content.json';

import { BECOME_PROMPT_ID, becomeCopy } from '@/features/become/becomeCopy';
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A few weeks of an archive for the Echoes and Patterns harness views: titled and untitled echoes,
 * mornings, a spoken one with its recording, and one that never became words. Every word is made up
 * for the harness and belongs to no one.
 */
function archiveSeed(): MemorySeed {
  const today = qaClock.localDay(QA_MOMENT);
  const at = QA_MOMENT.getTime();
  const daily = { promptId: 'daily', promptText: example.home.prompt };
  const morning = { promptId: BECOME_PROMPT_ID, promptText: becomeCopy.question };
  const entry = (id: string, offset: number, minutes: number, patch: Partial<Entry>): Entry => ({
    ...emptyContent(),
    ...daily,
    id,
    status: 'committed',
    durationSeconds: minutes * 60,
    createdAt: at + offset * DAY_MS,
    updatedAt: at + offset * DAY_MS,
    committedAt: at + offset * DAY_MS,
    localDay: addDays(today, offset),
    ...patch,
  });
  const recording = (id: string, minutes: number) => ({
    id,
    extension: '.m4a',
    durationSeconds: minutes * 60,
    recovered: false,
  });
  return {
    entries: [
      entry('qa-e1', 0, 3, {
        ...morning,
        body: 'Someone who answers slowly. Calm in the eleven o’clock review, honest if Rohan asks how the launch is really going, and home before eight.',
      }),
      entry('qa-e2', -1, 6, {
        title: example.home.recent.title,
        body: `${example.home.recent.excerpt} Today it was the empty chair at the table, and how nobody mentioned it.`,
      }),
      entry('qa-e3', -2, 7, {
        body: 'I keep saying yes before I have even heard the whole question, and then I spend the evening resenting the yes. Today it was the Saturday shoot. My jaw went tight while I was typing sure, happy to. Then I lay awake replaying the call.',
      }),
      entry('qa-e4', -3, 4, {
        mode: 'voice',
        body: 'Walked the long way home along the lake. The light on the water made the whole day feel smaller, in a good way. I didn’t check my phone once until the gate.',
        audio: recording('qa-a4', 4),
      }),
      entry('qa-e5', -4, 5, {
        body: 'Couldn’t sleep again. The same loop: did I say too much at dinner, did it sound like I was showing off. Nobody else is thinking about it. I know that, and the loop runs anyway.',
      }),
      entry('qa-e6', -6, 4, {
        title: 'Saying yes',
        body: 'Said yes to the Saturday shoot even though I promised myself a slow weekend. Sure, happy to. Why is that always the first thing out of my mouth?',
      }),
      entry('qa-e7', -8, 2, {
        ...morning,
        body: 'Steady. Stairs instead of the lift, lunch away from my desk, and one no without explaining it.',
      }),
      entry('qa-e8', -12, 1, { mode: 'voice', body: '', audio: recording('qa-a8', 1) }),
      entry('qa-e9', -21, 7, {
        promptId: 'first-echo',
        promptText: example.firstEntry.prompt,
        moodBefore: 'unsettled',
        body: 'Mostly that I am tired of being the one who is fine. Ma’s birthday tonight, and we laughed about the old flat in Pune. I want more evenings like this one.',
      }),
    ],
  };
}

function qaSeed(): MemorySeed {
  const fixture = qa.fixture;
  if (fixture === 'echoes') return archiveSeed();
  // The moments a stone is set in: Monday to Wednesday kept and today still to come, and the day of
  // the first echo with nothing before it. Every word is made up for the harness.
  if (fixture === 'stones' || fixture === 'welcome') {
    const day = qaClock.localDay(QA_MOMENT);
    const at = QA_MOMENT.getTime();
    const kept = (id: string, offset: number): Entry => ({
      ...emptyContent(),
      id,
      status: 'committed',
      body: 'A made up line for the harness.',
      durationSeconds: 5 * 60,
      createdAt: at + offset,
      updatedAt: at + offset,
      committedAt: at + offset,
      localDay: addDays(day, offset),
    });
    return {
      entries:
        fixture === 'welcome'
          ? [kept('qa-w0', 0)]
          : [kept('qa-s1', -3), kept('qa-s2', -2), kept('qa-s3', -1)],
    };
  }
  if (fixture !== 'home' && fixture !== 'completion' && fixture !== 'patterns') return {};
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
  const first = example.firstEntry;
  // Home's golden shows the recent entry at six minutes. Completion's shows the newest commit, which
  // is the entry just written, at seven. Both goldens read this same newest entry.
  const newestMinutes =
    qa.fixture === 'completion' ? first.durationMinutes : recent.durationMinutes;
  const recentContent = {
    title: recent.title,
    body: recent.excerpt,
    durationSeconds: newestMinutes * 60,
  };
  return {
    entries: [
      // Patterns opens at five echoes, so its harness view has one more, from the same example text.
      ...(fixture === 'patterns' ? [entry('qa-0', -4, { body: example.firstEntry.prompt })] : []),
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

// Harness only, and compiled out of real bundles: keeps an entry for today, as Reflect does, so
// that a recording can watch Home notice it. The words are made up. Installed when the journal is
// first made, never as the module loads.
function installQaKeep(): void {
  if (!qa.enabled || typeof window === 'undefined') return;
  (window as { __echoQaKeep?: () => Promise<void> }).__echoQaKeep = async () => {
    const { commitEntry, newDraftId, saveDraft } = await import('./api');
    const id = await newDraftId();
    if (!id.ok) return;
    const content = {
      ...emptyContent(),
      body: 'A made up line for the harness.',
      durationSeconds: 300,
    };
    await saveDraft(id.value, content);
    await commitEntry(id.value, content);
  };
}

/** Web holds everything in memory for one page load. Nothing is written anywhere. */
export async function getJournal(): Promise<Journal> {
  if (!journal) {
    journal = createMemoryJournal(qaSeed(), qa.enabled ? qaClock : deviceClock);
    installQaKeep();
  }
  return journal;
}

export function setJournal(next: Journal | null): void {
  journal = next;
}

/** Never reached: the gate is bypassed on web and export and delete-all have web variants. */
export function sqlJournalFor(): SqlJournal {
  throw new Error('storage is unavailable on web');
}
