import { dayAndMonth } from '@/features/echoes/entryFacts';
import type { BackupSummary, OpenFailure, RestoreCounts } from '@/services/importJournal';

/**
 * WORKING COPY for Restore from a backup, in You's Your data. Not locked: the owner approves or
 * replaces it with You's design. The preview's and the result's shapes are the lead's
 * ("This backup holds 42 entries, from 3 March to 8 November. Add them to this phone?" and
 * "42 entries restored. 3 were already on this phone."). Its days are written as the rest of ECHO
 * writes them, in the phone's own way: "from March 3 to November 8" on a phone set to US English.
 */

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/**
 * '2026-03-03' as Echoes writes the day, "March 3" or "3 March" as the phone does, with the year
 * when asked. Its spaces do not break, so no line of the sheet ends inside a date.
 */
const dayText = (day: string, withYear: boolean, locale?: string): string =>
  dayAndMonth(day, withYear, locale).replace(/\s/g, ' ');

/**
 * The span a backup covers. The year is left out when it is this one, said once at the end when both
 * days share another, and said for both when they differ. `locale` is for tests.
 */
export function spanText(
  first: string,
  last: string,
  thisYear: number,
  total: number,
  locale?: string,
): string {
  const firstYear = Number(first.slice(0, 4));
  const lastYear = Number(last.slice(0, 4));
  const sameYear = firstYear === lastYear;
  const lastWithYear = !sameYear || lastYear !== thisYear;
  if (first === last) {
    return `${total === 1 ? 'from' : 'all from'} ${dayText(last, lastWithYear, locale)}`;
  }
  return `from ${dayText(first, !sameYear, locale)} to ${dayText(last, lastWithYear, locale)}`;
}

/** "42 entries", "2 drafts", or "42 entries and 2 drafts". */
function holding(entries: number, drafts: number): string {
  const kept = count(entries, 'entry', 'entries');
  const unfinished = count(drafts, 'draft', 'drafts');
  if (drafts === 0) return kept;
  if (entries === 0) return unfinished;
  return `${kept} and ${unfinished}`;
}

export type RestoreProblem = OpenFailure | 'picker';

export const restoreCopy = {
  row: 'Restore from a backup',
  // The last two words are joined (U+00A0), because You's rows set their detail as it is given.
  rowDetail: 'Adds the entries from an ECHO export to this\u00a0phone',
  rowHint: 'Opens your files to choose a backup',
  reading: 'Reading your backup',

  title: 'Restore from a backup',

  preview(summary: BackupSummary, thisYear: number, locale?: string): string {
    const total = summary.entries + summary.drafts;
    const span = spanText(summary.firstDay, summary.lastDay, thisYear, total, locale);
    const question = total === 1 ? 'Add it to this phone?' : 'Add them to this phone?';
    return `This backup holds ${holding(summary.entries, summary.drafts)}, ${span}. ${question}`;
  },
  previewNote:
    'Nothing already on this phone is changed or replaced. Each entry is encrypted as it is added.',
  restore: 'Restore',
  notNow: 'Not now',

  restoring: (done: number, total: number) => `Restoring ${done} of ${total}`,
  restoringLabel: 'Restoring your backup',
  keepOpen: 'Keep ECHO open until this finishes.',

  done(counts: RestoreCounts): string {
    const added = counts.entries + counts.drafts;
    const lines = [
      added === 0 ? 'Nothing new to add.' : `${holding(counts.entries, counts.drafts)} restored.`,
    ];
    if (counts.existing > 0) {
      lines.push(
        counts.existing === 1
          ? '1 was already on this phone.'
          : `${counts.existing} were already on this phone.`,
      );
    }
    if (counts.deleted > 0) {
      lines.push(
        counts.deleted === 1
          ? '1 you deleted on this phone stays deleted.'
          : `${counts.deleted} you deleted on this phone stay deleted.`,
      );
    }
    if (counts.withoutAudio > 0) {
      lines.push(
        counts.withoutAudio === 1
          ? '1 came back without its recording, because the backup didn’t have it.'
          : `${counts.withoutAudio} came back without their recordings, because the backup didn’t have them.`,
      );
    }
    return lines.join(' ');
  },
  doneAction: 'Done',

  stopped(done: number, total: number): string {
    const room = 'If your phone is nearly full, free up some space';
    return done === 0
      ? `The restore stopped before it could add anything. ${room}, then try again.`
      : `The restore stopped after ${done} of ${total}. Nothing was left half done. ${room}, then restore the same file again to add the rest.`;
  },

  failed: {
    not_backup:
      'This file isn’t an ECHO backup. Choose the file ECHO saved when you exported your journal.',
    repacked:
      'This backup was zipped again by another app, so ECHO can’t read it. Choose the file exactly as ECHO saved it.',
    unsafe: 'This file tries to put things outside the backup, so ECHO won’t open it.',
    too_large: 'This file is larger than any ECHO backup can be, so ECHO won’t open it.',
    too_many: 'This file holds more than any ECHO backup can, so ECHO won’t open it.',
    newer: 'This backup is from a newer version of ECHO. Update ECHO, then try again.',
    damaged:
      'This backup is damaged, so nothing was added. If you still have the phone it came from, export your journal again.',
    empty: 'This backup holds no entries, so there is nothing to add.',
    unreadable:
      'ECHO couldn’t read this file. If your phone is nearly full, free up some space, then try again.',
    not_ready: 'Your journal isn’t open right now. Try again in a moment.',
    unavailable: 'Restoring isn’t available on this device.',
    picker: 'Your files couldn’t be opened. Try again.',
  } satisfies Record<RestoreProblem, string>,

  chooseAnother: 'Choose another file',
  chooseAgain: 'Choose the file again',
  tryAgain: 'Try again',
  close: 'Close',
} as const;
