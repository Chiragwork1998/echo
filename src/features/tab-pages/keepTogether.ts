/**
 * Ties the last two words together with a no-break space, so that a line never ends with one word
 * left alone on it (docs/DESIGN_QUALITY.md: no orphaned last words). Screen readers read the space
 * as a space. Only for ECHO's own words and a card's: a person's entries are shown as they wrote them.
 */
export const keepTogether = (text: string): string => text.replace(/ (\S+)$/, ' $1');
