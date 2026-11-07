import type { TextStyle } from 'react-native';

/**
 * Text set straight on the photograph gets the same faint shadow the Privacy step uses, so that it
 * stays legible over Day's clouds without a scrim (docs/SPEC_CONFLICTS.md, C-05).
 */
export const onPlate: TextStyle = {
  textShadowColor: 'rgba(3,11,22,0.4)',
  textShadowRadius: 6,
  textShadowOffset: { width: 0, height: 1 },
};

/**
 * Small supporting lines (dates, details). The caption token is tracked for short capitals, and
 * runs wide on a sentence, so these keep its size and drop the tracking, as Home's card meta does.
 */
export const supporting: TextStyle = { fontSize: 12.5, lineHeight: 17, letterSpacing: 0.1 };

// The pages' own named styles. Each is set once here and used by name, so that Echoes, Patterns and
// You read as one hand. Cormorant runs small beside Inter, so its sizes sit a step above the Inter
// they are paired with, as the display tokens do (src/design/typography.ts).

const SERIF = 'CormorantGaramond_400Regular';
const SERIF_MEDIUM = 'CormorantGaramond_500Medium';
const SANS = 'Inter_400Regular';
const SANS_MEDIUM = 'Inter_500Medium';

/** The name of a group on the plate: "Appearance", "November". */
export const groupTitle: TextStyle = { fontFamily: SERIF, fontSize: 24, lineHeight: 30 };

/** A title inside a list: an echo's first words, a week. */
export const itemTitle: TextStyle = { fontFamily: SERIF, fontSize: 20, lineHeight: 26 };

/** Running text a person reads rather than scans: a card's prose, an explanation. */
export const prose: TextStyle = { fontFamily: SANS, fontSize: 16, lineHeight: 24 };

/** A second line under a label, and short notes. */
export const detail: TextStyle = { fontFamily: SANS, fontSize: 14, lineHeight: 20 };

/** The first words of a paragraph that name it, run into the sentence. */
export const runIn: TextStyle = { fontFamily: SANS_MEDIUM };

/** A quiet word to tap: "Clear", "Try again", "Report this card". Sentence case, never shouting. */
export const textAction: TextStyle = {
  fontFamily: SANS_MEDIUM,
  fontSize: 14,
  lineHeight: 20,
  letterSpacing: 0.2,
};

/** A person's own words, read back: the session's Cormorant at the session's size (sky.ts). */
export const ownWords: TextStyle = {
  fontFamily: SERIF_MEDIUM,
  fontSize: 22,
  lineHeight: 33,
  letterSpacing: 0.15,
};

/** A line quoted from an entry. */
export const quoted: TextStyle = { fontFamily: SERIF_MEDIUM, fontSize: 20, lineHeight: 28 };

/** A question left with the person, or a calm heading inside a panel. */
export const question: TextStyle = { fontFamily: SERIF, fontSize: 24, lineHeight: 31 };
