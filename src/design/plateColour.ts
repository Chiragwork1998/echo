import { backgroundColours } from '@/design/generated/backgrounds';

import type { ThemeName } from './tokens';

/**
 * The dominant colour of a screen's plate, for whatever sits behind the plate while it loads and
 * while one screen dissolves into the next. Never white, and never the wrong theme. `screen` is a
 * plate's name; anything else gets `fallback`.
 */
export function plateColour(theme: ThemeName, screen: string, fallback: string): string {
  return (backgroundColours[theme] as Record<string, string>)[screen] ?? fallback;
}
