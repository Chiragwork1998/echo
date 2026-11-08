import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { usePlateFrame } from '@/design/usePlatePoint';
import { useReduceMotion } from '@/design/useReduceMotion';

import { BANDS, bandOpacity, bandShape, type Band, type BandName } from './veilBands';

/** The sky band keeps the name the one veil had; the others are named for where they lie. */
const TEST_IDS: Record<BandName, string> = {
  sky: 'breath-veil',
  valley: 'breath-veil-valley',
  ground: 'breath-veil-ground',
};
/** Ground first, so the sky is laid last: the order they darken in is the order they are drawn. */
const ORDER: BandName[] = ['ground', 'valley', 'sky'];

/** Black, with an alpha of `alpha`. A band of this feathers to nothing: it has no edge. */
const black = (alpha: number) => `rgba(0,0,0,${Math.round(alpha * 1000) / 1000})`;

function VeilBand({
  band,
  height,
  dark,
  full,
  testID,
}: {
  band: Band;
  height: number;
  dark: SharedValue<number>;
  full: boolean;
  testID: string;
}) {
  const shape = bandShape(band, height);
  const style = useAnimatedStyle(() => ({ opacity: bandOpacity(band, dark.get(), full) }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.band, { top: shape.top, height: shape.height }, style]}
      testID={testID}
    >
      <LinearGradient
        colors={shape.alphas.map(black) as unknown as readonly [string, string, ...string[]]}
        locations={shape.locations as unknown as readonly [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * The dark that comes down as the practice recedes. Three feathered bands of black, each laid by
 * opacity alone, go down from the ground up as `dark` rises (0 clear, 1 black) and lift from the sky
 * down as it falls. `full` (Sleep, once its fade has begun) takes them on to true black.
 *
 * Reduce Motion: one plain black veil, rising and falling over 180 ms. No bands.
 */
export function RecedeVeil({ dark, full }: { dark: SharedValue<number>; full: boolean }) {
  const reduced = useReduceMotion();
  const { height } = usePlateFrame();
  const plain = useAnimatedStyle(() => ({ opacity: dark.get() }));
  if (reduced) {
    return (
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.black, plain]}
        testID="breath-veil"
      />
    );
  }
  return (
    <>
      {ORDER.map((name) => (
        <VeilBand
          key={name}
          band={BANDS[name]}
          height={height}
          dark={dark}
          full={full}
          testID={TEST_IDS[name]}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  black: { backgroundColor: '#000000' },
  band: { position: 'absolute', left: 0, right: 0 },
});
