// The handoff is the single source of truth. Import, never copy, so values cannot drift.
import raw from '@handoff/design/tokens.json';

export const tokens = raw;
export type ThemeName = keyof typeof raw.color;
export type ThemeColors = (typeof raw.color)[ThemeName];
export type TypeVariant =
  | 'wordmark'
  | 'displayXL'
  | 'displayL'
  | 'displayM'
  | 'bodyL'
  | 'bodyM'
  | 'label'
  | 'button'
  | 'caption';
