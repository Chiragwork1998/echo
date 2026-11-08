import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { ribbonSway, ribbonTuck } from './standing';

/** The ribbon is drawn on a 9 by 28 board, and scales from there. */
export const RIBBON = { width: 9, height: 28 } as const;
/** How much of its tail is tucked into a shut book, in the ribbon's own points. */
const TUCK = 6;
/** The notch of the swallowtail, from the end of the band to the point of the notch. */
const NOTCH = 5.4;

const BAND = `M0 0H${RIBBON.width}V${RIBBON.height}L${RIBBON.width / 2} ${RIBBON.height - NOTCH}L0 ${RIBBON.height}Z`;
// Grosgrain: fine ribs across the band, 1.6 pt apart. They stop above the notch, where the swallowtail
// parts, so no rib is drawn on air.
const RIBS = Array.from(
  { length: Math.floor((RIBBON.height - NOTCH - 0.4) / 1.6) },
  (_, rib) => `M0 ${(1.6 * (rib + 1)).toFixed(1)}H${RIBBON.width}`,
).join('');
// Two threads of light along the selvedges, ending before the swallowtail.
const EDGES = `M0.9 0V${RIBBON.height - NOTCH * 0.2}M${RIBBON.width - 0.9} 0V${RIBBON.height - NOTCH * 0.2}`;

type Props = {
  /** The ribbon's colour: the foil of the cloth it marks. */
  foil: string;
  /** How much of the tail is out. Over a shut book it is tucked; the swing of the cover lets it down. */
  tucked?: boolean;
  /** Width in points: the ribbon is 9 by 28 at width 9. */
  width?: number;
  opacity?: number;
  /** The cover's swing (0 to 1). While it runs the tail comes down. Left out, the tail is as given by `tucked`. */
  cover?: SharedValue<number>;
  /** The book's arrival (0 to 1). While it runs the ribbon trails, and hangs straight again at rest. */
  arrive?: SharedValue<number>;
  testID?: string;
};

/**
 * A swallowtail ribbon. The tail comes out from between the pages: a clip holds the top of the band
 * still, and the band slides down inside it, so what lengthens is the free end and nothing else.
 */
export function Ribbon({
  foil,
  tucked = false,
  width = RIBBON.width,
  opacity = 1,
  cover,
  arrive,
  testID,
}: Props) {
  const scale = width / RIBBON.width;
  const height = RIBBON.height * scale;
  const resting = tucked ? 1 : 0;

  const sway = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${arrive ? ribbonSway(arrive.get()) : 0}deg` }],
  }));
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: -TUCK * scale * (cover ? ribbonTuck(cover.get()) : resting) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[styles.hang, { width, height, opacity }, sway]}
    >
      <View style={styles.clip}>
        <Animated.View style={slide}>
          <Svg height={height} viewBox={`0 0 ${RIBBON.width} ${RIBBON.height}`} width={width}>
            <Path d={BAND} fill={foil} />
            <Path d={RIBS} stroke="rgba(0,0,0,0.12)" strokeWidth={0.5} />
            <Path d={EDGES} stroke="rgba(255,255,255,0.22)" strokeWidth={0.6} />
          </Svg>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Hangs from its top, and sways from there.
  hang: { transformOrigin: 'top center' },
  clip: { flex: 1, overflow: 'hidden' },
});
