// The words of a text, counted exactly as ECHO's server counts them when it sets an entry out (POST
// /api/format, the contract D-017). This is a copy of `words` and `sameWords` in
// voice-api/src/format.ts, and must stay one: the server refuses a version whose words differ from what
// it was sent, and the journal refuses to keep one, by this same measure. Setting out may add or change
// punctuation, capitals and the space between words, and nothing else.
//
// It leans on what Hermes must do as Node does: NFC, Unicode property escapes with the `u` flag, and
// lookbehind. Curly quotes, Devanagari and accents are to be checked on a phone.

/** Curly quotes and apostrophes, made straight. */
const STRAIGHT: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  ʼ: "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '‟': '"',
};
const CURLY = /[‘’‚‛ʼ“”„‟]/gu;
/** A letter (with the marks that belong to it) or a digit. */
const WORDLY = '\\p{L}\\p{M}\\p{N}';
/**
 * What becomes a space: every character that is not a letter, a digit, an apostrophe or a hyphen, and
 * an apostrophe or hyphen without a letter or digit on both sides. The two sides are looked at in the
 * text as it was, so "well--known" loses both hyphens.
 */
const BETWEEN_WORDS = new RegExp(`[^${WORDLY}'-]|(?<![${WORDLY}])['-]|['-](?![${WORDLY}])`, 'gu');

/**
 * The words of a text: NFC; curly quotes and apostrophes made straight; lower case; every character
 * that is not a letter, a digit, or an apostrophe or hyphen inside a word becomes a space; then split
 * on whitespace. A letter is any Unicode letter together with its marks, so a Devanagari vowel sign
 * stays inside its word, and a digit is any Unicode number. Runs on decrypted text in memory only.
 *
 * So "Don’t" and "don't" are one word, the same; "can not" is two words and "cannot" one; "well-known"
 * is one word and "well known" two; "3" and "three" differ.
 */
export function words(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(CURLY, (mark) => STRAIGHT[mark] ?? mark)
    .toLowerCase()
    .replace(BETWEEN_WORDS, ' ')
    .split(/\s+/u)
    .filter((word) => word.length > 0);
}

/** True when two texts hold exactly the same words in the same order, as `words` reads them. */
export function sameWords(a: string, b: string): boolean {
  const before = words(a);
  const after = words(b);
  return before.length === after.length && before.every((word, index) => word === after[index]);
}
