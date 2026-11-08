import { DefaultTheme } from 'expo-router';

/**
 * What every screen of every stack stands on: nothing. A stack's screen is drawn over the plate
 * backing that lies beneath the whole navigator (see PlateBacking), and a screen that painted a flat
 * colour of its own would cover it, which is the flat colour that is shown whenever the photograph
 * that belongs there has not been drawn yet. Each screen draws its own plate (EchoBackground) above
 * the backing, and wherever that is not there yet the photograph that was there still is.
 */
export const CLEAR_SCREEN = { backgroundColor: 'transparent' } as const;

/**
 * The web navigator paints its theme's background over everything beneath it, so a stack on the web
 * would cover the backing (and, in the visual harness, compare against a white page). Native honours
 * the screens' own clear background and needs none of this.
 */
export const CLEAR_NAVIGATOR = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};
