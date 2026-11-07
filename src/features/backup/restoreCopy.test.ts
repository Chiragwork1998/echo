import { restoreCopy, spanText } from './restoreCopy';

const none = { entries: 0, drafts: 0, existing: 0, deleted: 0, withoutAudio: 0 };

describe('the preview', () => {
  const summary = { entries: 42, drafts: 0, firstDay: '2026-03-03', lastDay: '2026-11-08' };

  it('is the lead’s sentence', () => {
    expect(restoreCopy.preview(summary, 2026)).toBe(
      'This backup holds 42 entries, from 3 March to 8 November. Add them to this phone?',
    );
  });

  it('names drafts apart from entries', () => {
    expect(restoreCopy.preview({ ...summary, entries: 40, drafts: 2 }, 2026)).toBe(
      'This backup holds 40 entries and 2 drafts, from 3 March to 8 November. Add them to this phone?',
    );
    expect(
      restoreCopy.preview({ ...summary, entries: 0, drafts: 1, firstDay: '2026-11-08' }, 2026),
    ).toBe('This backup holds 1 draft, from 8 November. Add it to this phone?');
  });

  it('speaks of one entry, and of many on one day', () => {
    const day = { firstDay: '2026-03-03', lastDay: '2026-03-03' };
    expect(restoreCopy.preview({ entries: 1, drafts: 0, ...day }, 2026)).toBe(
      'This backup holds 1 entry, from 3 March. Add it to this phone?',
    );
    expect(restoreCopy.preview({ entries: 3, drafts: 0, ...day }, 2026)).toBe(
      'This backup holds 3 entries, all from 3 March. Add them to this phone?',
    );
  });

  it('gives the year only when it is not this one, and once when both days share it', () => {
    expect(spanText('2025-03-03', '2025-11-08', 2026, 9)).toBe('from 3 March to 8 November 2025');
    expect(spanText('2025-03-03', '2026-11-08', 2026, 9)).toBe(
      'from 3 March 2025 to 8 November 2026',
    );
    expect(spanText('2025-03-03', '2025-03-03', 2026, 1)).toBe('from 3 March 2025');
    expect(spanText('2026-01-01', '2026-12-31', 2026, 9)).toBe('from 1 January to 31 December');
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
    ...Object.values(restoreCopy).filter((value): value is string => typeof value === 'string'),
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
