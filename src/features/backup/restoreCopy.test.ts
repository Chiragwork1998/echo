import { longDate } from '@/features/echoes/entryFacts';

import { restoreCopy, spanText } from './restoreCopy';
import { typeset } from './RestoreSheet';

const none = { entries: 0, drafts: 0, existing: 0, deleted: 0, withoutAudio: 0 };

/** A date as the preview holds it: its spaces do not break, so no line ends inside it. */
const day = (text: string) => text.replace(/ /g, ' ');

describe('the preview', () => {
  const summary = { entries: 42, drafts: 0, firstDay: '2026-03-03', lastDay: '2026-11-08' };

  it('is the lead’s sentence, with its days as the phone writes them', () => {
    expect(restoreCopy.preview(summary, 2026, 'en-US')).toBe(
      `This backup holds 42 entries, from ${day('March 3')} to ${day('November 8')}. Add them to this phone?`,
    );
    expect(restoreCopy.preview(summary, 2026, 'en-GB')).toBe(
      `This backup holds 42 entries, from ${day('3 March')} to ${day('8 November')}. Add them to this phone?`,
    );
  });

  // Echoes heads an entry "Sunday, November 8" and a card says "Sun, Nov 8": the preview of the
  // same day must not say "8 November" beside them.
  it('writes a day exactly as Echoes writes it, in whatever language the phone is in', () => {
    const preview = spanText('2026-11-08', '2026-11-08', 2026, 1).replace(/ /g, ' ');
    expect(longDate('2026-11-08', 2026)).toContain(preview.replace(/^from /, ''));
  });

  it('names drafts apart from entries', () => {
    expect(restoreCopy.preview({ ...summary, entries: 40, drafts: 2 }, 2026, 'en-US')).toBe(
      `This backup holds 40 entries and 2 drafts, from ${day('March 3')} to ${day('November 8')}. Add them to this phone?`,
    );
    expect(
      restoreCopy.preview(
        { ...summary, entries: 0, drafts: 1, firstDay: '2026-11-08' },
        2026,
        'en-US',
      ),
    ).toBe(`This backup holds 1 draft, from ${day('November 8')}. Add it to this phone?`);
  });

  it('speaks of one entry, and of many on one day', () => {
    const days = { firstDay: '2026-03-03', lastDay: '2026-03-03' };
    expect(restoreCopy.preview({ entries: 1, drafts: 0, ...days }, 2026, 'en-US')).toBe(
      `This backup holds 1 entry, from ${day('March 3')}. Add it to this phone?`,
    );
    expect(restoreCopy.preview({ entries: 3, drafts: 0, ...days }, 2026, 'en-US')).toBe(
      `This backup holds 3 entries, all from ${day('March 3')}. Add them to this phone?`,
    );
  });

  it('gives the year only when it is not this one, and once when both days share it', () => {
    expect(spanText('2025-03-03', '2025-11-08', 2026, 9, 'en-US')).toBe(
      `from ${day('March 3')} to ${day('November 8, 2025')}`,
    );
    expect(spanText('2025-03-03', '2026-11-08', 2026, 9, 'en-US')).toBe(
      `from ${day('March 3, 2025')} to ${day('November 8, 2026')}`,
    );
    expect(spanText('2025-03-03', '2025-03-03', 2026, 1, 'en-US')).toBe(
      `from ${day('March 3, 2025')}`,
    );
    expect(spanText('2026-01-01', '2026-12-31', 2026, 9, 'en-US')).toBe(
      `from ${day('January 1')} to ${day('December 31')}`,
    );
    expect(spanText('2025-03-03', '2025-11-08', 2026, 9, 'en-GB')).toBe(
      `from ${day('3 March')} to ${day('8 November 2025')}`,
    );
  });
});

describe('the result', () => {
  it('is the lead’s sentence', () => {
    expect(restoreCopy.done({ ...none, entries: 42, existing: 3 })).toBe(
      '42 entries restored. 3 were already on this phone.',
    );
  });

  it('counts one of each in the singular', () => {
    expect(
      restoreCopy.done({ entries: 1, drafts: 1, existing: 1, deleted: 1, withoutAudio: 1 }),
    ).toBe(
      '1 entry and 1 draft restored. 1 was already on this phone. 1 you deleted on this phone stays deleted. 1 came back without its recording, because the backup didn’t have it.',
    );
  });

  it('counts many in the plural', () => {
    expect(restoreCopy.done({ ...none, entries: 5, deleted: 2, withoutAudio: 2 })).toBe(
      '5 entries restored. 2 you deleted on this phone stay deleted. 2 came back without their recordings, because the backup didn’t have them.',
    );
  });

  it('says plainly when there was nothing new', () => {
    expect(restoreCopy.done({ ...none, existing: 42 })).toBe(
      'Nothing new to add. 42 were already on this phone.',
    );
  });

  it('says where a stopped restore leaves things, and what to do', () => {
    expect(restoreCopy.stopped(12, 42)).toBe(
      'The restore stopped after 12 of 42. Nothing was left half done. If your phone is nearly full, free up some space, then restore the same file again to add the rest.',
    );
    expect(restoreCopy.stopped(0, 42)).toBe(
      'The restore stopped before it could add anything. If your phone is nearly full, free up some space, then try again.',
    );
  });

  it('refuses a newer backup in the lead’s words', () => {
    expect(restoreCopy.failed.newer).toBe(
      'This backup is from a newer version of ECHO. Update ECHO, then try again.',
    );
  });
});

describe('every word', () => {
  const lines = [
    ...(Object.values(restoreCopy) as unknown[]).filter(
      (value): value is string => typeof value === 'string',
    ),
    ...Object.values(restoreCopy.failed),
    restoreCopy.preview(
      { entries: 2, drafts: 1, firstDay: '2025-03-03', lastDay: '2026-11-08' },
      2026,
    ),
    restoreCopy.done({ entries: 2, drafts: 2, existing: 2, deleted: 2, withoutAudio: 2 }),
    restoreCopy.stopped(3, 9),
    restoreCopy.restoring(3, 9),
  ];

  it('has no exclamation, no dash, and no word about AI', () => {
    for (const line of lines) {
      expect(line).not.toMatch(/!/);
      expect(line).not.toMatch(/[-–—]/);
      expect(line).not.toMatch(/\b(AI|magic|insights|smart|unlock|journey|seamless|effortless)\b/i);
    }
  });

  it('starts every line with a capital, in sentence case', () => {
    for (const line of lines) expect(line).toMatch(/^[A-Z0-9]/);
    expect(restoreCopy.row).toBe('Restore from a backup');
    expect([restoreCopy.restore, restoreCopy.notNow]).toEqual(['Restore', 'Not now']);
  });
});

describe('how the sheet sets a line', () => {
  it('keeps a day with its month, and never leaves one word alone at the end', () => {
    expect(typeset('from 3 March to 8 November. Add them to this phone?')).toBe(
      'from 3 March to 8 November. Add them to this phone?',
    );
    expect(typeset('Restore from a backup')).toBe('Restore from a backup');
    expect(typeset('Done')).toBe('Done');
  });
});
