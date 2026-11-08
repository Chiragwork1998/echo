// The opening of the book is a ritual, and a ritual that plays every morning becomes friction
// (D-008). The whole of it plays for the first few sessions, and then it is about half as long: the
// stillness, the book rising and the cover swinging all quicken. Any tap skips what is left. The
// closing of the book is the same ritual played back, and shortens with it.

/** How many times the book opens in full before it begins to hurry. */
export const FULL_OPENINGS = 5;

/**
 * The book closing, in ms from the moment the entry is safely kept: the opening played back. The
 * full closing's movements are 300 to 600 ms; a practised book's are about half (D-015), and the
 * glint and the ribbon's tuck are the last of the cover's own time, not movements of their own.
 */
export type Closing = {
  /** The last leaf turning, with the page's own words on it. */
  leaf: number;
  /** When the cover starts to come back, after the leaf has begun. */
  coverAt: number;
  /** The cover coming down. It lands softly. */
  cover: number;
  /** The book is shut, and rests this long before it sinks. */
  gap: number;
  /** The book sinking from sight as the next screen comes. */
  sink: number;
  /** A light along the cover's top edge as it lands: the last of the cover's time. */
  glint: number;
  /** The ribbon's tail drawn up as the book shuts: the last of the cover's time. */
  tuck: number;
};

export type Ritual = {
  /** The mountains alone, before anything else, in ms. */
  stillness: number;
  /** The book rising from the lower edge (the daily echo). */
  rise: number;
  /** The book coming forward from the shelf (First Echo): it travels a little and settles. */
  forward: number;
  /** The cover swinging open. */
  cover: number;
  /** The closing: the opening played back. */
  close: Closing;
};

export const FULL: Ritual = {
  stillness: 1500,
  rise: 1500,
  forward: 520,
  cover: 1100,
  close: { leaf: 520, coverAt: 280, cover: 560, gap: 80, sink: 460, glint: 240, tuck: 280 },
};
export const SHORT: Ritual = {
  stillness: 750,
  rise: 800,
  forward: 300,
  cover: 550,
  close: { leaf: 300, coverAt: 150, cover: 300, gap: 40, sink: 260, glint: 150, tuck: 150 },
};

/** What is left of the ritual once a tap says enough: everything finishes together, quickly. */
export const HURRY_MS = 300;

/**
 * When each part of the closing happens, in ms from the moment it begins. The cover is down at
 * `contactAt`, the book begins to sink at `sinkAt`, the next screen is asked for at `goAt` (half way
 * through the sink, so its fade begins while the book is half gone), and all is still at `endAt`.
 */
export function closeTimeline(ritual: Ritual) {
  const { coverAt, cover, gap, sink } = ritual.close;
  const contactAt = coverAt + cover;
  const sinkAt = contactAt + gap;
  return { contactAt, sinkAt, goAt: sinkAt + sink / 2, endAt: sinkAt + sink };
}

/** How long the quiet things (controls, the light, notices) take to leave as the closing begins. */
export const PART_MS = 220;
/** How long a closing takes under Reduce Motion: a fade in place, and then on. */
export const CLOSE_REDUCED_MS = 180;

export const ritualFor = (opens: number): Ritual => (opens >= FULL_OPENINGS ? SHORT : FULL);
