import type { fontMap } from '@/design/fonts';

// The golden sets this screen's type lighter than the token weights. Names are checked against the
// bundled fonts, so a rename cannot leave them pointing at nothing.
type FontName = keyof typeof fontMap;
export const LIGHT_SANS: FontName = 'Inter_300Light';
export const LIGHT_SERIF: FontName = 'CormorantGaramond_300Light';
