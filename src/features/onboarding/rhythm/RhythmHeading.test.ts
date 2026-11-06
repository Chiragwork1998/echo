import { copy } from '@/content/copy';

import { breakLines } from './RhythmHeading';

describe('breakLines', () => {
  it('breaks the subtitle after "when", as the golden does', () => {
    expect(breakLines(copy.rhythm.subtitle, 38)).toBe(
      'A small daily ritual works best when\nit has a place in your day.',
    );
  });

  it('leaves a short line alone, and never splits a word', () => {
    expect(breakLines('Short line', 38)).toBe('Short line');
    expect(breakLines('Extraordinarily long', 5)).toBe('Extraordinarily\nlong');
  });

  it('keeps every word, in order', () => {
    const text = copy.rhythm.subtitle;
    expect(breakLines(text, 20).replaceAll('\n', ' ')).toBe(text);
  });
});
