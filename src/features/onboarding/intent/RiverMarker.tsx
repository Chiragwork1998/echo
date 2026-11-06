import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import type { ThemeName } from '@/design/tokens';

import { MARKER } from './geometry';

// Measured from the goldens. The ring is a 1.5 pt white outline over a dark glass centre. Chosen, it
// swells into a warm 27 pt ring, with a cream dot, so selection reads by shape as well as colour.
const IDLE_STROKE = 1.75;
const SELECTED_RING = 2;
const DOT_DIAMETER = 15.5;
const IDLE_SCALE = MARKER.idleDiameter / MARKER.selectedDiameter;
const PRESS_SCALE = 0.96;

const GOLD_STOPS = ['#FFE6A6', '#F0C88A'] as const;
const DOT_STOPS = ['#F8F3ED', '#E6DFD8'] as const;
const GLOW = '0 0 16px rgba(255,226,170,0.62)';

// The glass behind a ring, sampled from each golden.
const GLASS: Record<ThemeName, { idle: string; selected: string }> = {
  night: { idle: 'rgba(20,41,70,0.9)', selected: '#7A6C56' },
  day: { idle: 'rgba(78,93,104,0.9)', selected: '#8D7D61' },
};

type Props = {
  /** 0 at rest, 1 when chosen. A spring, so it may overshoot slightly. */
  progress: SharedValue<number>;
  /** 0 to 1 while the finger is down. */
  press: SharedValue<number>;
};

/** The ring on the river. Decorative: the parent control carries the role, label and state. */
export function RiverMarker({ progress, press }: Props) {
  const { name, colors } = useTheme();
  const glass = GLASS[name];

  const root = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - PRESS_SCALE) * press.get() }],
  }));
  const idle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, progress.get()),
    transform: [{ scale: 1 + (1 / IDLE_SCALE - 1) * progress.get() }],
  }));
  const chosen = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get()),
    transform: [{ scale: IDLE_SCALE + (1 - IDLE_SCALE) * progress.get() }],
  }));
  const dot = useAnimatedStyle(() => ({
    transform: [{ scale: Math.max(0, progress.get()) }],
  }));

  return (
    <Animated.View
      style={[styles.box, root]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.idle,
          { borderColor: colors.textPrimary, backgroundColor: glass.idle },
          idle,
        ]}
      />
      <Animated.View style={[styles.chosen, { boxShadow: GLOW }, chosen]}>
        <LinearGradient
          colors={GOLD_STOPS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gold}
        />
        <View style={[styles.glass, { backgroundColor: glass.selected }]} />
        <Animated.View style={[styles.dot, dot]}>
          <LinearGradient
            colors={DOT_STOPS}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const SELECTED = MARKER.selectedDiameter;
const GLASS_DIAMETER = SELECTED - SELECTED_RING * 2;

const styles = StyleSheet.create({
  box: { width: SELECTED, height: SELECTED, alignItems: 'center', justifyContent: 'center' },
  idle: {
    position: 'absolute',
    width: MARKER.idleDiameter,
    height: MARKER.idleDiameter,
    borderRadius: MARKER.idleDiameter / 2,
    borderWidth: IDLE_STROKE,
  },
  chosen: {
    position: 'absolute',
    width: SELECTED,
    height: SELECTED,
    borderRadius: SELECTED / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gold: { ...StyleSheet.absoluteFill, borderRadius: SELECTED / 2 },
  glass: {
    position: 'absolute',
    width: GLASS_DIAMETER,
    height: GLASS_DIAMETER,
    borderRadius: GLASS_DIAMETER / 2,
  },
  dot: {
    width: DOT_DIAMETER,
    height: DOT_DIAMETER,
    borderRadius: DOT_DIAMETER / 2,
    overflow: 'hidden',
  },
});
