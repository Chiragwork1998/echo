// The opening of the book is a ritual, and a ritual that plays every morning becomes friction
// (D-008). The whole of it plays for the first few sessions, and then it is about half as long: the
// stillness, the book rising and the cover swinging all quicken. Any tap skips what is left.

/** How many times the book opens in full before it begins to hurry. */
export const FULL_OPENINGS = 5;

export type Ritual = {
  /** The mountains alone, before anything else, in ms. */
  stillness: number;
  /** The book rising from the lower edge (the daily echo). */
  rise: number;
  /** The book coming forward from the shelf (First Echo). */
  forward: number;
  /** The cover swinging open. */
  cover: number;
};

export const FULL: Ritual = { stillness: 1500, rise: 1500, forward: 420, cover: 1100 };
export const SHORT: Ritual = { stillness: 750, rise: 800, forward: 260, cover: 550 };

/** What is left of the ritual once a tap says enough: everything finishes together, quickly. */
export const HURRY_MS = 300;

export const ritualFor = (opens: number): Ritual => (opens >= FULL_OPENINGS ? SHORT : FULL);
