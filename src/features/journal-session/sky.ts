import { useWindowDimensions } from 'react-native';

import { useTheme } from '@/design/theme';
import { usePaperInk } from '@/features/book/paper';
import { qa } from '@/testing/qa';

// The open sky of the daily echo (D-003). Measured on the Home plate at the 393 x 852 reference: the
// sky runs to about 210 pt, with the peaks behind it from 210 to 330 pt on Night. The writing keeps
// to the sky, so the mountains stay in view above the keyboard.
export const SKY = { top: 52, bottom: 212 };

/** Words on the sky. Cormorant Garamond at 22 pt with a generous line. */
export const WRITING = { size: 22, line: 33, tracking: 0.15, side: 34, fade: 36 };

/** How long the mountains have the screen to themselves before the first sign of a caret. */
export const STILLNESS_MS = 1500;
/** Without typing for this long, the quiet controls come to the surface. */
export const QUIET_MS = 4000;
export const CARET = { width: 2, height: 25 };
export const LIGHT = 10;
/** Distance of the quiet controls from the keyboard, or from the bottom edge without one. */
export const CONTROLS = { aboveKeyboard: 16, aboveEdge: 26, height: 44 };

/**
 * Cream on Night. On Day the sky is brighter, so the words stay cream and lean on a deeper, wider
 * shadow than a panel would need: there is no panel, only the sky.
 */
export function useSkyInk() {
  const { name, colors } = useTheme();
  // Words drawn on a page (D-004) take the page's own ink: it is the page, not the sky, behind them.
  const page = usePaperInk();
  const day = name === 'day';
  const shadow = day
    ? {
        textShadowColor: 'rgba(8,28,58,0.62)',
        textShadowRadius: 9,
        textShadowOffset: { width: 0, height: 1 },
      }
    : {
        textShadowColor: 'rgba(2,10,24,0.6)',
        textShadowRadius: 8,
        textShadowOffset: { width: 0, height: 1 },
      };
  if (page) return { text: page.ink, quiet: page.muted, glow: page.glow, shadow: {} } as const;
  return {
    text: day ? '#FFFDF8' : colors.textPrimary,
    quiet: day ? 'rgba(255,253,248,0.9)' : 'rgba(247,243,235,0.82)',
    glow: day ? 'rgba(255,250,235,0.9)' : 'rgba(255,240,214,0.75)',
    shadow,
  } as const;
}

/** The writing area, in screen points, from the plate-mapped sky and the user's text size. */
export function useSkyFrame(
  plate: (x: number, y: number) => { y: number; scale: number },
  insetTop: number,
) {
  const { fontScale, height } = useWindowDimensions();
  const grown = Math.min(Math.max(fontScale, 1), 2);
  const top = Math.max(plate(0, SKY.top).y, insetTop + 8);
  const base = plate(0, SKY.bottom).y - top;
  // Larger type keeps about three and a half lines in view, and still scrolls.
  const wanted = WRITING.line * grown * 3.5 + WRITING.fade * Math.min(grown, 1.5);
  return {
    top,
    height: Math.min(Math.max(base, wanted), height * 0.5),
    fade: WRITING.fade * Math.min(grown, 1.5),
  };
}

/** The visual harness has no keyboard, so it can reserve the space of one: window.__echoKeyboard. */
export function qaKeyboardHeight(): number {
  if (!qa.enabled) return 0;
  const value = Number((window as { __echoKeyboard?: number }).__echoKeyboard);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
