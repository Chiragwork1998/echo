import { copy } from '@/content/copy';

import { bindLastWords, minutesWritten, savedLine } from './text';

describe('savedLine', () => {
  it('is the deck line itself for the deck’s seven minutes', () => {
    expect(savedLine(7 * 60)).toBe(copy.completion.saved);
  });

  it('keeps the deck’s words and separator and changes only the time', () => {
    expect(savedLine(12 * 60)).toBe('Saved privately · 12 minutes');
    expect(savedLine(2 * 60)).toBe('Saved privately · 2 minutes');
  });

  it('says one minute, not one minutes', () => {
    expect(savedLine(60)).toBe('Saved privately · 1 minute');
    expect(savedLine(89)).toBe('Saved privately · 1 minute');
  });

  it('never rounds a short entry down to nothing', () => {
    expect(minutesWritten(5)).toBe(1);
    expect(savedLine(20)).toBe('Saved privately · 1 minute');
  });

  it('rounds to the nearest minute', () => {
    expect(minutesWritten(90)).toBe(2);
    expect(minutesWritten(149)).toBe(2);
    expect(minutesWritten(151)).toBe(3);
  });

  it('says only that it is saved when the length is unknown, rather than guess', () => {
    for (const unknown of [0, -5, null, undefined, Number.NaN]) {
      expect(savedLine(unknown)).toBe('Saved privately');
    }
  });
});

describe('bindLastWords', () => {
  it('ties the last two words with a no-break space', () => {
    expect(bindLastWords('The reflection can wait.')).toBe('The reflection can wait.');
  });

  it('leaves a single word alone', () => {
    expect(bindLastWords('Saved')).toBe('Saved');
  });

  it('still reads as the same sentence once whitespace is normalised', () => {
    const line = 'Your words are saved. The reflection can wait.';
    expect(bindLastWords(line).replace(/\s+/g, ' ')).toBe(line);
  });
});
