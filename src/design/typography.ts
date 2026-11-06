import type { TextStyle } from 'react-native';

import { tokens, type TypeVariant } from './tokens';

/** Tokens were sized for New York. Cormorant runs small, so display sizes scale to match goldens. */
const CORMORANT_DISPLAY_SCALE = 1.1;

const displayVariants: readonly TypeVariant[] = ['displayXL', 'displayL', 'displayM'];

const sansFamily = (weight: number) =>
  weight >= 600 ? 'Inter_600SemiBold' : weight >= 500 ? 'Inter_500Medium' : 'Inter_400Regular';

export function textStyle(
  variant: TypeVariant,
  options: { serif?: boolean; italic?: boolean } = {},
): TextStyle {
  const t = tokens.typography[variant];
  const display = displayVariants.includes(variant);
  const serif = options.serif ?? (display || variant === 'wordmark');
  const scale = display ? CORMORANT_DISPLAY_SCALE : 1;

  const family = !serif
    ? sansFamily(t.weight)
    : variant === 'wordmark'
      ? 'CormorantGaramond_300Light'
      : options.italic
        ? 'CormorantGaramond_400Regular_Italic'
        : 'CormorantGaramond_400Regular';

  return {
    fontFamily: family,
    fontSize: t.size * scale,
    lineHeight: t.lineHeight * scale,
    letterSpacing: t.tracking,
  };
}
