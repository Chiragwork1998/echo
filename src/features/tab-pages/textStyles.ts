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
