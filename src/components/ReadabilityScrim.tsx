import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useEchoTheme } from '@/design/ThemeProvider';

/**
 * Exact stops from `product-handoff/assets/overlays/scrim-day.svg`. Both rects
 * cover the full viewport; only their gradients carry the fade.
 */
const DAY_TOP = {
  colors: ['rgba(6,20,38,0.46)', 'rgba(6,20,38,0.06)', 'rgba(6,20,38,0)'],
  locations: [0, 0.42, 0.72],
} as const;
const DAY_BOTTOM = {
  colors: ['rgba(2,10,20,0.64)', 'rgba(2,10,20,0.08)', 'rgba(2,10,20,0)'],
  locations: [0, 0.48, 0.76],
} as const;

/**
 * Exact stops from `product-handoff/assets/overlays/scrim-night.svg`. The plate
 * is never washed with a full-screen grade: night keeps only this scrim, the
 * moon/stars overlay and the grain layer.
 */
const NIGHT_SCRIM = {
  colors: ['rgba(1,10,28,0.40)', 'rgba(3,27,60,0.08)', 'rgba(2,8,18,0.50)'],
  locations: [0, 0.55, 1],
} as const;

/**
 * Readability scrim only: the validated production plates already carry the
 * moon, starfield and grain, so this layer never re-draws them and never adds a
 * full-screen wash — just the top and bottom fades from the handoff overlay.
 */
export function ReadabilityScrim() {
  const { name } = useEchoTheme();

  if (name === 'night') {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={NIGHT_SCRIM.colors}
          locations={NIGHT_SCRIM.locations}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={DAY_TOP.colors}
        end={{ x: 0.5, y: 1 }}
        locations={DAY_TOP.locations}
        start={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={DAY_BOTTOM.colors}
        end={{ x: 0.5, y: 0 }}
        locations={DAY_BOTTOM.locations}
        start={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
