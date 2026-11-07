/** The most of a morning entry that comes back in Rehearse. */
export const REHEARSE_LIMIT = 240;
/** The longest phrase shown at once: two lines of the phrase type on a phone. */
export const PHRASE_MAX = 48;
/** A fragment this short joins its neighbour rather than standing alone. */
const PHRASE_MIN = 12;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

// A sentence ends at . ! ? or …, with any closing quote or bracket after it.
const SENTENCE_END = /[.!?…]+["'”’)\]]*(?=\s|$)/g;

/**
 * The words that come back: at most the first 240 characters, ending where a sentence ends. A first
 * sentence longer than that is cut at the last pause or space before the limit instead, so a word is
 * never broken.
 */
export function rehearsalText(body: string): string {
  const text = collapse(body);
  if (text.length <= REHEARSE_LIMIT) return text;
  let end = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const stop = (match.index ?? 0) + match[0].length;
    if (stop > REHEARSE_LIMIT) break;
    end = stop;
  }
  if (end > 0) return text.slice(0, end);
  const head = text.slice(0, REHEARSE_LIMIT + 1);
  const pause = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '));
  if (pause > REHEARSE_LIMIT / 2) return head.slice(0, pause + 1);
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head.slice(0, REHEARSE_LIMIT)).trim();
}

/** Splits at the spaces after these marks, keeping the mark with the words before it. */
function splitAfter(text: string, marks: RegExp): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (const match of text.matchAll(marks)) {
    const stop = (match.index ?? 0) + match[0].length;
    pieces.push(text.slice(start, stop).trim());
    start = stop;
  }
  pieces.push(text.slice(start).trim());
  return pieces.filter((piece) => piece.length > 0);
}

/** Breaks a long run of words into even parts, at spaces, each within the limit where possible. */
function balance(text: string): string[] {
  if (text.length <= PHRASE_MAX) return [text];
  const words = text.split(' ');
  const parts = Math.ceil(text.length / PHRASE_MAX);
  const target = text.length / parts;
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > target && out.length < parts - 1) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** Short fragments join the phrase before them, or after if they come first, while there is room. */
function mergeShort(pieces: string[]): string[] {
  const out: string[] = [];
  for (const piece of pieces) {
    const previous = out.at(-1);
    const joined = previous === undefined ? piece : `${previous} ${piece}`;
    const short =
      piece.length < PHRASE_MIN || (previous !== undefined && previous.length < PHRASE_MIN);
    if (previous !== undefined && short && joined.length <= PHRASE_MAX)
      out[out.length - 1] = joined;
    else out.push(piece);
  }
  return out;
}

/**
 * The person's words, a phrase at a time: whole sentences, then within a long sentence its clauses,
 * then even runs of words, so that no phrase is longer than two lines.
 */
export function phrasesOf(body: string): string[] {
  const text = rehearsalText(body);
  if (!text) return [];
  const sentences = splitAfter(text, /[.!?…]+["'”’)\]]*(?=\s)/g);
  const pieces = sentences.flatMap((sentence) =>
    sentence.length <= PHRASE_MAX
      ? [sentence]
      : splitAfter(sentence, /[,;:]["'”’)\]]*(?=\s)|\s[–—](?=\s)/g).flatMap(balance),
  );
  return mergeShort(pieces);
}

/** How long a phrase stays, by its length: long enough to be taken in slowly, never long. */
export function phraseMs(phrase: string): number {
  return Math.min(5200, Math.max(2600, 1400 + phrase.length * 70));
}
