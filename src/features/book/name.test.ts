// The name a person writes on their book: what is kept of it, and how it is drawn. Invented names only.
import { NAME_MAX, isLatinName, sanitiseName } from './name';

describe('sanitiseName', () => {
  it('keeps a name as it was written, without the space around it', () => {
    expect(sanitiseName('  Mira  ')).toBe('Mira');
    expect(sanitiseName('Mira Okafor')).toBe('Mira Okafor');
  });

  it('closes up the space inside it to single spaces', () => {
    expect(sanitiseName('Mira \t\n  Okafor')).toBe('Mira Okafor');
  });

  it('writes accents one way, however the keyboard composed them', () => {
    const composed = 'Renée';
    const decomposed = 'Renée';
    expect(sanitiseName(decomposed)).toBe(composed);
    expect(sanitiseName(composed)).toBe(composed);
  });

  it('removes control characters, which no one can see or mean', () => {
    expect(sanitiseName('Mi\u0000ra\u0007')).toBe('Mira');
    expect(sanitiseName('Mi\u0085ra\u009f')).toBe('Mira');
    expect(sanitiseName('Mi\u007fra')).toBe('Mira');
  });

  it('keeps at most 24 characters, counting what a person sees as one as one where it can', () => {
    expect(NAME_MAX).toBe(24);
    const long = 'Abcdefghijklmnopqrstuvwxyz';
    expect(sanitiseName(long)).toBe(long.slice(0, 24));
    // An emoji is one character, not two halves of one.
    const withEmoji = `${'a'.repeat(23)}\u{1F33F}tail`;
    expect(Array.from(sanitiseName(withEmoji) ?? '')).toHaveLength(24);
    expect(sanitiseName(withEmoji)?.endsWith('\u{1F33F}')).toBe(true);
    // A mark that composes with its letter is one character once composed.
    expect(Array.from(sanitiseName(`${'b'.repeat(23)}é`) ?? '')).toHaveLength(24);
  });

  it('is nothing when nothing is left', () => {
    expect(sanitiseName('')).toBeNull();
    expect(sanitiseName('   ')).toBeNull();
    expect(sanitiseName('\u0000\u0001')).toBeNull();
    expect(sanitiseName(null)).toBeNull();
    expect(sanitiseName(undefined)).toBeNull();
  });

  it('does not trim the end of a long name into a trailing space', () => {
    expect(sanitiseName(`${'a'.repeat(23)} b`)).toBe('a'.repeat(23));
  });
});

describe('isLatinName', () => {
  it('is true for names set in Latin letters, with their accents and joining marks', () => {
    for (const name of ['Mira', 'Renée Dupont', 'Zoë', 'O’Neill', 'Anne-Marie', 'J. R.', 'Łucja']) {
      expect(isLatinName(name)).toBe(true);
    }
  });

  it('is false for names in other scripts, which the serif italic cannot draw', () => {
    for (const name of ['आरव', 'Aarav आरव', '王芳', 'Мира', 'سارا']) {
      expect(isLatinName(name)).toBe(false);
    }
  });
});
