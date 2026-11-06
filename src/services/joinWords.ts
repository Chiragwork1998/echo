// Joining the words of a take that was sent in pieces which overlap by a few seconds.
//
// An ADTS file cannot be listened to for a quiet moment without decoding it, so each piece begins a
// few seconds before the last one ended, and a word at a cut is heard twice. The tail of one piece
// and the head of the next are searched for the longest run of the same words, and the run is kept
// once. When nothing matches with confidence the two are joined with a space and nothing is dropped:
// a word said twice is better than a word lost.

export type Spoken = {
  text: string;
  /**
   * The same words before the server changed how Hindi is written, when it sent them. Hindi spelled
   * in Roman script can differ from one piece to the next for the very same sound, and Devanagari
   * rarely does, so these are what the overlap is looked for in. Used only when both pieces have
   * them, with as many words as `text`.
   */
  heard?: string;
};

/** The fewest words in a row that count as the same stretch of speech. */
export const MIN_RUN = 3;
/** How many words at the end of one piece, and at the start of the next, are searched. */
const WINDOW = 20;
/** Of the words the overlap would cover, at least this share must be the same on both sides. */
const AGREEMENT = 0.5;

type Word = { start: number; key: string };

const WORD = /\S+/gu;
const NOT_LETTERS = /[^\p{L}\p{M}\p{N}]/gu;

/**
 * The words of a text with where each begins. Case, punctuation and apostrophes do not matter, and
 * letters of any script count, Devanagari with its vowel signs included. A mark with no letter or
 * number in it (a dash, a full stop, the Hindi danda) is not a word.
 */
function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(WORD)) {
    const key = match[0].normalize('NFC').toLowerCase().replace(NOT_LETTERS, '');
    if (key.length > 0) words.push({ start: match.index, key });
  }
  return words;
}

type Overlap = {
  /** Where the shared run begins in the last words of the first text, counted from its start. */
  tail: number;
  /** Where it begins in the first words of the second. */
  head: number;
};

/**
 * Where the end of `before` and the start of `after` say the same words. The pieces overlap in time,
 * so the stretch they share is the whole start of the second and the whole end of the first. A run
 * of matching words is believed when most of the stretch it implies agrees too, and of the runs
 * believed the one that throws away the fewest words wins. When two throw away as many, the longer
 * run wins.
 *
 * Fewest thrown, not longest, because of a phrase someone really said more than once. Said three
 * times, "I did not mean it" matches itself a repeat along as well as in place, and a longer run is
 * always found a repeat along, where the join would drop a repeat that was spoken. The match at the
 * cut itself is the one that throws away almost nothing. Where a refrain fills the whole overlap and
 * more, which is four or more repeats of six words, the text alone cannot say which repeat is which,
 * and a repeat can still be lost.
 */
function findOverlap(before: string[], after: string[]): Overlap | null {
  const tailLength = Math.min(WINDOW, before.length);
  const headLength = Math.min(WINDOW, after.length);
  const tailFrom = before.length - tailLength;
  let best: (Overlap & { run: number; thrown: number }) | null = null;

  for (let i = 0; i < tailLength; i += 1) {
    for (let j = 0; j < headLength; j += 1) {
      if (before[tailFrom + i] !== after[j]) continue;
      // Only where a run begins.
      if (i > 0 && j > 0 && before[tailFrom + i - 1] === after[j - 1]) continue;
      let run = 1;
      while (
        i + run < tailLength &&
        j + run < headLength &&
        before[tailFrom + i + run] === after[j + run]
      ) {
        run += 1;
      }
      if (run < MIN_RUN) continue;

      // Words ahead of the run in the second text, and behind it in the first, are the ones the other
      // side heard differently. The stretch that is shared covers both, and the run.
      const ahead = j;
      const behind = tailLength - (i + run);
      const span = ahead + run + behind;
      if (span > tailLength || span > headLength) continue;
      let agree = 0;
      for (let k = 0; k < span; k += 1) {
        if (before[before.length - span + k] === after[k]) agree += 1;
      }
      if (agree / span < AGREEMENT) continue;

      const thrown = ahead + behind;
      if (!best || thrown < best.thrown || (thrown === best.thrown && run > best.run)) {
        best = { tail: i, head: j, run, thrown };
      }
    }
  }
  return best && { tail: tailFrom + best.tail, head: best.head };
}

/** The words of `heard`, if there are as many of them as there are in the text it stands beside. */
function aligned(heard: string | undefined, words: Word[]): Word[] | null {
  if (heard === undefined) return null;
  const spoken = wordsOf(heard);
  return spoken.length === words.length ? spoken : null;
}

const glue = (left: string, right: string) => (left.length === 0 ? right : `${left} ${right}`);

/**
 * `second` follows `first`, the end of one overlapping the start of the other. The shared run is
 * kept once. The first text is kept up to and including the run's first word, which it heard in its
 * own middle, and the second carries on from the run's second word. Each side gives up the words it
 * heard at the edge of its piece, where a word may have been cut in two and where a recogniser adds
 * a capital or a full stop that the speech did not have.
 */
export function joinSpoken(first: Spoken, second: Spoken): Spoken {
  const left = first.text.trimEnd();
  const right = second.text.trimStart();
  if (left.length === 0) return { text: right, heard: second.heard };
  if (right.length === 0) return { text: left, heard: first.heard };

  const leftWords = wordsOf(left);
  const rightWords = wordsOf(right);
  const leftHeard = aligned(first.heard?.trimEnd(), leftWords);
  const rightHeard = aligned(second.heard?.trimStart(), rightWords);
  const both = leftHeard !== null && rightHeard !== null;
  const keys = (words: Word[]) => words.map(({ key }) => key);

  const overlap = findOverlap(
    keys(both ? leftHeard : leftWords),
    keys(both ? rightHeard : rightWords),
  );
  if (!overlap) {
    return {
      text: glue(left, right),
      heard: both ? glue(first.heard!.trimEnd(), second.heard!.trimStart()) : undefined,
    };
  }

  // A run is at least MIN_RUN words, so each side has a second word in it.
  const keep = (text: string, words: Word[]) =>
    text.slice(0, words[overlap.tail + 1]!.start).trimEnd();
  const rest = (text: string, words: Word[]) => text.slice(words[overlap.head + 1]!.start);
  return {
    text: glue(keep(left, leftWords), rest(right, rightWords)),
    heard: both
      ? glue(keep(first.heard!.trimEnd(), leftHeard), rest(second.heard!.trimStart(), rightHeard))
      : undefined,
  };
}

/** The words of pieces in the order they were spoken, as one text. */
export function joinSpokenPieces(pieces: Spoken[]): string {
  if (pieces.length === 0) return '';
  let joined = pieces[0]!;
  for (const piece of pieces.slice(1)) joined = joinSpoken(joined, piece);
  return joined.text;
}
