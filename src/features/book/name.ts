// The name a person may write on their book. It is theirs: kept sealed on this phone, never sent,
// never logged, and gone with everything else when they delete their data (./ownerStore.ts).

/** The most a name may be, in characters as a person sees them where that can be told (code points). */
export const NAME_MAX = 24;

// Control characters, which no one can see or mean: C0, DEL and C1.
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * What is kept of a name as written: composed one way (NFC), without control characters, its spaces
 * closed up to single ones and trimmed, and at most 24 characters. Counted by code point, with
 * Array.from, as Hermes may not have Intl.Segmenter. Nothing left is no name at all.
 */
export function sanitiseName(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  const kept = Array.from(clean).slice(0, NAME_MAX).join('').trimEnd();
  return kept.length > 0 ? kept : null;
}

// Latin letters with their accents and the marks that join them, the space, the digits, and the
// punctuation names are written with: what Cormorant Garamond draws.
const LATIN = /^[ -~ -ɏ̀-ͯḀ-ỿ -⁯]*$/u;

/**
 * Whether a name is set in Latin letters, so the cover's serif italic can draw it. A name in another
 * script (Cormorant has no Devanagari, for one) is drawn in the system serif, upright.
 */
export function isLatinName(name: string): boolean {
  return LATIN.test(name);
}
