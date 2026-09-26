import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonStars } from './MoonStars';
import { useEchoTheme } from '@/design/ThemeProvider';

export type DayScrimGradient = {
  colors: readonly [string, string, ...string[]];
  locations: readonly [number, number, ...number[]];
  height: DimensionValue;
};

export type DayScrims = { top: DayScrimGradient; bottom: DayScrimGradient };

/** Exact stops from `product-handoff/assets/overlays/scrim-night.svg`. */
const NIGHT_SCRIM = {
  colors: ['rgba(1,10,28,0.40)', 'rgba(3,27,60,0.08)', 'rgba(2,8,18,0.50)'],
  locations: [0, 0.55, 1],
} as const;

type ReadabilityScrimProps = {
  /** Day keeps the two existing screen scrims unchanged. */
  day: DayScrims;
  /** Day-only container override, e.g. bleeding past the safe-area insets. */
  style?: StyleProp<ViewStyle>;
};

export function ReadabilityScrim({ day, style }: ReadabilityScrimProps) {
  const { name } = useEchoTheme();
  const insets = useSafeAreaInsets();

  if (name === 'night') {
    return (
      <View
        pointerEvents="none"
        style={[styles.field, { top: -insets.top, bottom: -insets.bottom }]}
      >
        <LinearGradient
          colors={NIGHT_SCRIM.colors}
          locations={NIGHT_SCRIM.locations}
          style={StyleSheet.absoluteFill}
        />
        <MoonStars />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={[styles.field, style]}>
      <LinearGradient
        colors={day.top.colors}
        locations={day.top.locations}
        style={[styles.edge, { height: day.top.height, top: 0 }]}
      />
      <LinearGradient
        colors={day.bottom.colors}
        locations={day.bottom.locations}
        style={[styles.edge, { bottom: 0, height: day.bottom.height }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  edge: { position: 'absolute', right: 0, left: 0 },
});
