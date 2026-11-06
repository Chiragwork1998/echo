import { toSummary } from './content';
import { getJournal, setJournal } from './runtime.web';
import type { JournalResult } from './types';

const mockQa: { enabled: boolean; fixture?: string } = { enabled: true, fixture: 'home' };

jest.mock('@/testing/qa', () => ({
  get qa() {
    return mockQa;
  },
}));

function unwrap<T>(result: JournalResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

beforeEach(() => setJournal(null));

describe('the web preview journal', () => {
  it('reproduces the Home golden: Monday to Thursday, four reflections', async () => {
    const rhythm = unwrap(await (await getJournal()).getRhythm());
    expect(rhythm.week.map((day) => day.completed)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(rhythm.week.find((day) => day.isToday)?.weekday).toBe('thu');
    expect(rhythm.weekReflections).toBe(4);
    expect(rhythm.currentStreak).toBe(4);
  });

  it('shows the golden recent entry and draft', async () => {
    const journal = await getJournal();
    expect(unwrap(await journal.latestEntry())).toMatchObject({
      title: 'The weight I didn’t name',
      durationSeconds: 360,
    });
    const draft = unwrap(await journal.latestDraft());
    expect(draft && toSummary(draft)).toMatchObject({ title: 'I keep returning to…' });
    expect(draft?.durationSeconds).toBe(300);
  });

  it('gives Completion its reflection', async () => {
    mockQa.fixture = 'completion';
    const journal = await getJournal();
    const latest = unwrap(await journal.latestEntry());
    const reflection = unwrap(await journal.getReflection(latest?.id ?? ''));
    expect(reflection?.text).toContain('more uncertainty than failure');
    mockQa.fixture = 'home';
  });

  it('starts empty for every other screen', async () => {
    mockQa.fixture = 'first-echo';
    const journal = await getJournal();
    expect(unwrap(await journal.latestDraft())).toBeNull();
    expect(unwrap(await journal.listEntries())).toEqual([]);
    mockQa.fixture = 'home';
  });

  it('never stores anything: a new page load starts clean', async () => {
    mockQa.fixture = undefined;
    const first = await getJournal();
    unwrap(await first.commitEntry('a', { body: 'in memory', mode: 'text', durationSeconds: 0 }));
    expect(unwrap(await first.listEntries())).toHaveLength(1);

    setJournal(null); // A reload.
    expect(unwrap(await (await getJournal()).listEntries())).toEqual([]);
    mockQa.fixture = 'home';
  });
});
