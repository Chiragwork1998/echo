import type { BlurTint } from 'expo-blur';

import { useTheme } from '@/design/theme';

// Day sets this screen on light frosted glass with ink type, measured from the golden. The shared
// GlassCard is dark in both themes, so the Rhythm parts draw their own glass from these values.
const DAY = {
  tint: 'light',
  card: 'rgba(250,247,240,0.64)',
  cardSelected: 'rgba(255,253,248,0.8)',
  edge: 'rgba(255,255,255,0.74)',
  gold: '#F6C65C',
  track: 'rgba(112,98,78,0.5)',
  sheet: 'rgba(247,243,235,0.98)',
} as const;

const NIGHT = {
  tint: 'dark',
  card: 'rgba(10,12,16,0.74)',
  dial: 'rgba(9,12,17,0.84)',
  cardSelected: 'rgba(52,47,41,0.78)',
  edge: 'rgba(244,239,229,0.16)',
  track: 'rgba(244,239,229,0.3)',
  sheet: 'rgba(12,18,30,0.98)',
} as const;

export type Tone = {
  tint: BlurTint;
  /** Type and icons on the glass. */
  ink: string;
  inkSoft: string;
  /** Fills for the dial, the preset cards and the reminder row, and the selected card. */
  dial: string;
  card: string;
  cardSelected: string;
  /** Hairline around cards, and around the dial. */
  edge: string;
  rim: string;
  /** Selection, the arc beside the handle, and the switch when on. */
  gold: string;
  track: string;
  knob: string;
  sheet: string;
};

export function useTone(): Tone {
  const { name, colors } = useTheme();
  if (name === 'day') {
    return {
      ...DAY,
      ink: colors.textInk,
      inkSoft: 'rgba(19,38,58,0.74)',
      dial: DAY.card,
      rim: colors.borderGlass,
      knob: '#FBF8F2',
    };
  }
  return {
    ...NIGHT,
    ink: colors.textPrimary,
    inkSoft: 'rgba(247,243,235,0.72)',
    rim: colors.borderGlass,
    gold: colors.accentWarm,
    knob: '#F4EEE4',
  };
}
