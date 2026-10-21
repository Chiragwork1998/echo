import { Platform, type TextStyle } from 'react-native';

/**
 * Platform font mapping for ECHO (`product-handoff/assets/fonts/README.md`).
 *
 * Audit note — why `New York` does not resolve on iOS:
 * React Native's iOS font resolver (`RCTFont.mm`) looks the string up as a
 * *family name* (`UIFont.fontNamesForFamilyName`), then as a PostScript name.
 * Apple ships New York as four optical-size families — `New York Small`,
 * `New York Medium`, `New York Large`, `New York Extra Large` — and there is no
 * family called `New York`. A value of `New York` therefore matches nothing,
 * logs `Unrecognized font family`, and silently renders SF Pro. The handoff
 * asks for `New York Large` (`design/tokens.json` § typography), which is a real
 * family name and resolves for both regular and italic faces.
 */
const IOS_DISPLAY = 'New York Large';
const IOS_UI = 'System';
const IOS_UI_LIGHT = 'System';

const GOOGLE_DISPLAY = {
  italic: 'CormorantGaramond_400Regular_Italic',
  medium: 'CormorantGaramond_500Medium',
  regular: 'CormorantGaramond_400Regular',
} as const;

const GOOGLE_UI = {
  bold: 'Inter_700Bold',
  light: 'Inter_300Light',
  medium: 'Inter_500Medium',
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
} as const;

const IS_WEB = Platform.OS === 'web';

/**
 * Web resolves `fontFamily` as CSS, so a stack keeps rendering the intended
 * face even if the bundled webfont is still loading (or blocked offline).
 */
function stack(primary: string, fallback: string): string {
  return IS_WEB ? `'${primary}', ${fallback}` : primary;
}

export const fontFamily = {
  display: Platform.select({
    ios: IOS_DISPLAY,
    default: stack(GOOGLE_DISPLAY.regular, "'Cormorant Garamond', Georgia, serif"),
  }) as string,
  displayItalic: Platform.select({
    ios: IOS_DISPLAY,
    default: stack(GOOGLE_DISPLAY.italic, "'Cormorant Garamond', Georgia, serif"),
  }) as string,
  displayMedium: Platform.select({
    ios: IOS_DISPLAY,
    default: stack(GOOGLE_DISPLAY.medium, "'Cormorant Garamond', Georgia, serif"),
  }) as string,
  ui: Platform.select({
    ios: IOS_UI,
    default: stack(GOOGLE_UI.regular, "'Inter', -apple-system, system-ui, sans-serif"),
  }) as string,
  uiLight: Platform.select({
    ios: IOS_UI_LIGHT,
    default: stack(GOOGLE_UI.light, "'Inter', -apple-system, system-ui, sans-serif"),
  }) as string,
  uiMedium: Platform.select({
    ios: IOS_UI,
    default: stack(GOOGLE_UI.medium, "'Inter', -apple-system, system-ui, sans-serif"),
  }) as string,
  uiSemibold: Platform.select({
    ios: IOS_UI,
    default: stack(GOOGLE_UI.semibold, "'Inter', -apple-system, system-ui, sans-serif"),
  }) as string,
} as const;

export type UITextWeight = 'light' | 'regular' | 'medium' | 'semibold' | 'bold';

const IOS_UI_WEIGHT: Record<UITextWeight, TextStyle['fontWeight']> = {
  bold: '700',
  light: '300',
  medium: '500',
  regular: '400',
  semibold: '600',
};

const GOOGLE_UI_FAMILY: Record<UITextWeight, string> = {
  bold: GOOGLE_UI.bold,
  light: GOOGLE_UI.light,
  medium: GOOGLE_UI.medium,
  regular: GOOGLE_UI.regular,
  semibold: GOOGLE_UI.semibold,
};

/**
 * Interface text. On iOS the family is the system font and the weight must be
 * carried by `fontWeight`; on Android and web each weight is a separate
 * bundled Inter file, so no synthetic weight is applied.
 */
export function uiTextStyle(weight: UITextWeight = 'regular'): TextStyle {
  if (Platform.OS === 'ios') {
    return { fontFamily: IOS_UI, fontWeight: IOS_UI_WEIGHT[weight] };
  }
  return { fontFamily: stack(GOOGLE_UI_FAMILY[weight], "'Inter', -apple-system, system-ui, sans-serif") };
}

/** Display text. Italic needs `fontStyle` only where the family carries faces. */
export function displayTextStyle(
  variant: 'regular' | 'medium' | 'italic' = 'regular',
): TextStyle {
  if (variant === 'italic') {
    return Platform.OS === 'ios'
      ? { fontFamily: IOS_DISPLAY, fontStyle: 'italic' }
      : { fontFamily: fontFamily.displayItalic };
  }
  if (variant === 'medium') {
    return Platform.OS === 'ios'
      ? { fontFamily: IOS_DISPLAY, fontWeight: '500' }
      : { fontFamily: fontFamily.displayMedium };
  }
  return { fontFamily: fontFamily.display };
}

/**
 * Families ECHO relies on but does not bundle, kept in one place so the audit
 * is greppable and a future runtime probe has a single source of truth.
 */
export const platformFontExpectations = {
  android: [GOOGLE_DISPLAY.regular, GOOGLE_DISPLAY.medium, GOOGLE_UI.regular, GOOGLE_UI.medium],
  ios: [IOS_DISPLAY, IOS_UI],
  web: [GOOGLE_DISPLAY.regular, GOOGLE_DISPLAY.italic, GOOGLE_UI.regular, GOOGLE_UI.medium],
} as const;
