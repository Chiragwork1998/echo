import {
  displayTextStyle,
  fontFamily,
  uiTextStyle,
} from './typography';

export const tokens = {
  meta: { name: 'ECHO', referenceViewport: { width: 393, height: 852, unit: 'pt' }, grid: 4 },
  layout: { gutter: 24, maxContentWidth: 345 },
  color: {
    day: {
      textPrimary: '#F8F5EE', textInk: '#13263A', textSecondary: '#E5E8E8', surfacePrimary: '#F6F1E8',
      surfaceGlass: 'rgba(11,25,42,0.54)', surfaceGlassStrong: 'rgba(8,19,33,0.72)',
      borderGlass: 'rgba(255,255,255,0.58)', accentWarm: '#D9BE91', accentRiver: '#5BC7D9',
      focus: '#FFF4DF', danger: '#C96B5E',
      /** Calm control material: flat cream, hairline highlight, quiet disabled. */
      surfaceSelected: 'rgba(246,241,232,0.18)', hairlineStrong: 'rgba(255,255,255,0.72)',
      hairlineSoft: 'rgba(255,255,255,0.24)',
      ctaHighlight: 'rgba(255,255,255,0.66)', ctaDisabledFill: '#DCD4C6',
      ctaDisabledInk: 'rgba(19,38,58,0.62)', ctaDisabledBorder: 'rgba(255,255,255,0.34)',
    },
    night: {
      textPrimary: '#F7F3EB', textInk: '#0B1D35', textSecondary: '#D9E0EA', surfacePrimary: '#F3EDE3',
      surfaceGlass: 'rgba(7,18,35,0.66)', surfaceGlassStrong: 'rgba(5,14,29,0.82)',
      borderGlass: 'rgba(244,239,229,0.54)', accentWarm: '#E8CCA0', accentRiver: '#41BBD4',
      focus: '#FFF0D6', danger: '#D98273',
      surfaceSelected: 'rgba(243,237,227,0.16)', hairlineStrong: 'rgba(244,239,229,0.62)',
      hairlineSoft: 'rgba(244,239,229,0.22)',
      ctaHighlight: 'rgba(255,255,255,0.52)', ctaDisabledFill: '#D5CEC1',
      ctaDisabledInk: 'rgba(11,29,53,0.62)', ctaDisabledBorder: 'rgba(244,239,229,0.34)',
    },
  },
  typography: {
    displayFamily: fontFamily.display,
    displayFamilyMedium: fontFamily.displayMedium,
    displayFamilyItalic: fontFamily.displayItalic,
    uiFamily: fontFamily.ui,
    uiFamilyLight: fontFamily.uiLight,
    uiFamilyMedium: fontFamily.uiMedium,
    uiFamilySemibold: fontFamily.uiSemibold,
    wordmark: { size: 28, weight: 400, tracking: 12, lineHeight: 32 },
    displayXL: { size: 52, weight: 400, lineHeight: 54, tracking: -1 },
    displayL: { size: 44, weight: 400, lineHeight: 48, tracking: -0.6 },
    displayM: { size: 32, weight: 400, lineHeight: 36, tracking: -0.2 },
    bodyL: { size: 18, weight: 400, lineHeight: 25, tracking: 0 },
    bodyM: { size: 16, weight: 400, lineHeight: 22, tracking: 0 },
    /** Restrained tracking: only the wordmark keeps letterspacing. */
    label: { size: 13, weight: 500, lineHeight: 17, tracking: 0.4 },
    button: { size: 15, weight: 500, lineHeight: 20, tracking: 0.2 },
    caption: { size: 12, weight: 400, lineHeight: 16, tracking: 0.6 },
  },
  /**
   * Ready-to-spread text styles. Use these instead of a bare `fontFamily` so
   * iOS system-font weights resolve (see `src/design/typography.ts`).
   */
  type: {
    display: displayTextStyle('regular'),
    displayItalic: displayTextStyle('italic'),
    displayMedium: displayTextStyle('medium'),
    ui: uiTextStyle('regular'),
    uiLight: uiTextStyle('light'),
    uiMedium: uiTextStyle('medium'),
    uiSemibold: uiTextStyle('semibold'),
  },
  space: { 2: 2, 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40, 48: 48, 64: 64 },
  radius: { small: 12, medium: 18, large: 24, pill: 999, button: 28, card: 24 },
  size: { tapTarget: 44, primaryButtonHeight: 56, tabBarHeight: 72, headerHeight: 44, toggleWidth: 52, toggleHeight: 30, icon: 24 },
  motion: { instant: 120, fast: 180, standard: 320, screen: 650, atmosphere: 900, spring: { damping: 18, stiffness: 190, mass: 0.8 } },
  /** Shared control material: flat fills, hairline edges, gentle press scale. */
  control: {
    pressScale: 0.985,
    pressDuration: 180,
    shadow: { color: '#061423', opacity: 0.16, radius: 9, offsetY: 3, elevation: 2 },
    pillRadius: 999,
    capsuleRadius: 18,
  },
} as const;
