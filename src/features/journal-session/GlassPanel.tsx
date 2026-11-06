import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { GlassBlur } from '@/components/GlassCard';
import { useTheme } from '@/design/theme';

// The writing surface is frosted, not dark: the goldens lighten the scenery behind it (Night a
// little, Day a lot) where GlassCard's tokens darken it. Measured from the two goldens.
const SURFACE_TINT = { night: 'rgba(244,239,229,0.09)', day: 'rgba(255,255,255,0.45)' } as const;
const SURFACE_TINT_SOLID = { night: 'rgba(24,38,62,0.9)', day: 'rgba(246,241,232,0.92)' } as const;

function useReduceTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/** The page barely blurs what is behind it: the goldens keep the moon and mountains legible. */
const SURFACE_BLUR = 2;

type Props = PropsWithChildren<{
  radius: number;
  blur?: number;
  /** A fill over the blur. Omit for the frosted writing surface. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
}>;

/** Blurred glass with a hairline border, for shapes GlassCard's dark tokens cannot express. */
export function GlassPanel({ radius, blur = SURFACE_BLUR, tint, style, children }: Props) {
  const { name, colors } = useTheme();
  const solid = useReduceTransparency();
  const fill = tint ?? (solid ? SURFACE_TINT_SOLID[name] : SURFACE_TINT[name]);
  return (
    <View style={[styles.clip, { borderRadius: radius, borderColor: colors.borderGlass }, style]}>
      {!solid && <GlassBlur radius={blur} />}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {children}
    </View>
  );
}

// Night's glass is thin, so a bright moon can sit behind a line of writing. A soft shadow holds it.
const NIGHT_SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.45)',
  textShadowRadius: 6,
  textShadowOffset: { width: 0, height: 1 },
} as const;

/** Text colours for the frosted surface: ink on Day's light glass, cream on Night's. */
export function useSurfaceInk() {
  const { name, colors } = useTheme();
  const day = name === 'day';
  return {
    text: day ? colors.textInk : colors.textPrimary,
    muted: day ? `${colors.textInk}99` : `${colors.textSecondary}A6`,
    shadow: day ? undefined : NIGHT_SHADOW,
  };
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden', borderWidth: 1 } });
