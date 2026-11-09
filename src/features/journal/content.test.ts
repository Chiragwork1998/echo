import { cutAtWord, emptyContent, paragraphsOf, toSummary } from './content';
import type { Entry } from './types';

const entry = (patch: Partial<Entry>): Entry => ({
  ...emptyContent(),
  id: 'a',
  status: 'committed',
  createdAt: 0,
  updatedAt: 0,
  committedAt: 0,
  localDay: '2026-11-05',
  ...patch,
});

describe('cutAtWord', () => {
  it('leaves what fits alone', () => {
    expect(cutAtWord('Short and whole.', 60)).toBe('Short and whole.');
  });

  it('ends on a whole word, without trailing punctuation, and marks what was left out', () => {
    expect(cutAtWord('I keep saying yes before I have even heard the whole question', 60)).toBe(
      'I keep saying yes before I have even heard the whole…',
    );
    expect(cutAtWord('Monday, and the rain, and the long, slow bus home again', 22)).toBe(
      'Monday, and the rain…',
    );
  });

  it('cuts a word too long to break where it must', () => {
    expect(cutAtWord('Supercalifragilisticexpialidocious', 10)).toBe('Supercalif…');
  });
});

describe('paragraphsOf', () => {
  it('splits at blank lines, keeps a single break inside its paragraph, and drops empty ones', () => {
    expect(paragraphsOf('First thought.\n\nSecond one,\nstill going.\n \n\n\nLast.')).toEqual([
      'First thought.',
      'Second one,\nstill going.',
      'Last.',
    ]);
    expect(paragraphsOf('one\r\n\r\ntwo')).toEqual(['one', 'two']);
    expect(paragraphsOf('   ')).toEqual([]);
  });
});

describe('toSummary', () => {
  it('names an untitled entry by its first words, and keeps which question it answered', () => {
    const summary = toSummary(
      entry({
        body: 'I keep saying yes before I have even heard the whole question, again.',
        promptId: 'become',
        promptText: 'Who will you be today?',
      }),
    );
    expect(summary.title).toBe('I keep saying yes before I have even heard the whole…');
    expect(summary.promptId).toBe('become');
    // The question's words are not carried: only which one it was.
    expect(JSON.stringify(summary)).not.toContain('Who will you be today?');
  });

  it('keeps an entry’s own title', () => {
    expect(toSummary(entry({ title: 'The weight I didn’t name', body: 'Words' })).title).toBe(
      'The weight I didn’t name',
    );
  });
});
