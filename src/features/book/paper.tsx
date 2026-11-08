import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';

import { useTheme } from '@/design/theme';

/**
 * What a page is made of. Paper is the original: warm cream and dark ink. Vellum is the daily echo's
 * page (D-004): a thin translucent sheet, so the mountains show through it, tinted just enough for
 * words to read on it. Night's vellum is smoked and carries cream ink, Day's is pale and carries
 * deep ink. The photograph beneath is never touched: only the sheet changes.
 */
export type Surface = 'paper' | 'vellum';

export type PaperLook = {
  fill: string;
  ink: string;
  muted: string;
  /** The page's own edge, a hairline that keeps a translucent sheet from dissolving into the sky. */
  edge: string;
  /** A soft light across the top, and the shade in the gutter at the spine. */
  sheen: string;
  gutter: string;
  grain: string;
  grainOpacity: number;
  /** How dark the shadow of a lifting leaf may be. */
  shade: number;
  /** Cloth-coloured text and glow for the breathing light. */
  glow: string;
  /** The slivers of earlier leaves at the spine, nearest first. */
  leaves: readonly [string, string, string];
  ribbonOpacity: number;
};

const PAPER: PaperLook = {
  fill: '#F2EBDD',
  ink: '#1F2733',
  muted: '#7C7466',
  edge: 'rgba(60,44,24,0.12)',
  sheen: 'rgba(255,255,255,0)',
  gutter: 'rgba(60,44,24,0.22)',
  grain: '#5A4630',
  grainOpacity: 0.22,
  shade: 1,
  glow: 'rgba(31,39,51,0.55)',
  leaves: ['#E4DBC9', '#D9CEB8', '#CEC2AA'],
  ribbonOpacity: 1,
};

const VELLUM = {
  night: {
    fill: 'rgba(14,24,42,0.5)',
    ink: '#F7F1E4',
    muted: 'rgba(247,241,228,0.62)',
    edge: 'rgba(247,239,220,0.34)',
    sheen: 'rgba(255,246,226,0.12)',
    gutter: 'rgba(2,8,20,0.42)',
    grain: '#FFF3DC',
    grainOpacity: 0.13,
    shade: 0.45,
    glow: 'rgba(255,240,214,0.75)',
    leaves: ['rgba(240,230,208,0.42)', 'rgba(230,218,192,0.32)', 'rgba(220,206,178,0.24)'],
    ribbonOpacity: 0.9,
  },
  day: {
    fill: 'rgba(251,246,234,0.6)',
    ink: '#18222E',
    muted: 'rgba(24,34,46,0.58)',
    edge: 'rgba(255,255,250,0.78)',
    sheen: 'rgba(255,255,255,0.28)',
    gutter: 'rgba(70,52,28,0.2)',
    grain: '#5A4630',
    grainOpacity: 0.17,
    shade: 0.5,
    glow: 'rgba(24,34,46,0.55)',
    leaves: ['rgba(250,244,230,0.8)', 'rgba(240,232,214,0.7)', 'rgba(230,220,198,0.6)'],
    ribbonOpacity: 0.92,
  },
} as const satisfies Record<'night' | 'day', PaperLook>;

export function usePaperLook(surface: Surface): PaperLook {
  const { name } = useTheme();
  return surface === 'paper' ? PAPER : VELLUM[name];
}

const PaperContext = createContext<PaperLook | null>(null);

/** Lets anything drawn on the page, such as a note about the microphone, take the page's ink. */
export function PaperProvider({ look, children }: { look: PaperLook; children: ReactNode }) {
  return <PaperContext.Provider value={look}>{children}</PaperContext.Provider>;
}
export const usePaperInk = () => useContext(PaperContext);

// A light fibre and fleck, generated once and tiled. Fixed numbers, so the grain is the same on
// every launch and every leaf, and a turning page carries exactly the grain of the one beneath.
const TILE = 96;
const MARKS = (() => {
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 40 }, () => {
    const x = next() * TILE;
    const y = next() * TILE;
    const fibre = next() < 0.3;
    return {
      x,
      y,
      fibre,
      length: 3 + next() * 7,
      slant: (next() - 0.5) * 3,
      size: 0.35 + next() * 0.5,
      weight: 0.3 + next() * 0.7,
    };
  });
})();

/** The paper's fibre and fleck. Pattern cards are made of the book's paper too. */
export function Grain({ look }: { look: PaperLook }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <Pattern id="paperGrain" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          {MARKS.map((mark, i) =>
            mark.fibre ? (
              <Path
                key={i}
                d={`M${mark.x.toFixed(1)} ${mark.y.toFixed(1)} l${mark.length.toFixed(1)} ${mark.slant.toFixed(1)}`}
                stroke={look.grain}
                strokeWidth={0.4}
                strokeLinecap="round"
                opacity={mark.weight}
              />
            ) : (
              <Circle
                key={i}
                cx={mark.x}
                cy={mark.y}
                r={mark.size}
                fill={look.grain}
                opacity={mark.weight}
              />
            ),
          )}
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#paperGrain)" opacity={look.grainOpacity} />
    </Svg>
  );
}

/** One leaf: its sheet, grain, soft edge, a light across the top, and the shade of the spine. */
export function Sheet({
  look,
  style,
  children,
}: {
  look: PaperLook;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.sheet, { backgroundColor: look.fill }, style]}>
      <Grain look={look} />
      <LinearGradient
        colors={[look.sheen, 'rgba(255,255,255,0)']}
        locations={[0, 1]}
        pointerEvents="none"
        style={styles.sheen}
      />
      {/* A fixed-width gutter: web gradients ignore the end point and span the whole view. */}
      <LinearGradient
        colors={[look.gutter, 'rgba(0,0,0,0.04)', 'rgba(0,0,0,0)']}
        end={{ x: 1, y: 0 }}
        locations={[0, 0.4, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={styles.gutterShade}
      />
      <View pointerEvents="none" style={[styles.rim, { borderColor: look.edge }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { borderRadius: 3, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%' },
  gutterShade: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 42 },
  rim: { ...StyleSheet.absoluteFill, borderWidth: 1, borderRadius: 3 },
});
