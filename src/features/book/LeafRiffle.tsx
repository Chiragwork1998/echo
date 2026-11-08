import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { PaperLook } from './paper';
import { leafProgress, leafShade, riffleOpacity } from './standing';

const PERSPECTIVE = 1800;

type Props = {
  /** How many leaves: a count of echoes in the book, nothing more (./standing). */
  count: number;
  /** The cover's swing (0 to 1). Every leaf is driven by it, so a tap or a practised book scales them for free. */
  cover: SharedValue<number>;
  look: PaperLook;
};

/**
 * A few leaves of the book lifting from the spine in the wake of the cover, the way a thumb riffles
 * the edge of a thick book. Plain sheets in the page's own paper, with no grain and no SVG: they are
 * on screen for half a second, in motion, and take no touches.
 */
export function LeafRiffle({ count, cover, look }: Props) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Leaf key={index} index={index} cover={cover} look={look} />
      ))}
    </>
  );
}

function Leaf({ index, cover, look }: { index: number } & Pick<Props, 'cover' | 'look'>) {
  const turn = useAnimatedStyle(() => {
    const c = cover.get();
    const progress = leafProgress(c, index);
    return {
      // It leaves with the board as the board comes to rest, never cut off at the end.
      opacity: riffleOpacity(c, index),
      transform: [{ perspective: PERSPECTIVE }, { rotateY: `${-180 * progress}deg` }],
    };
  });
  const shade = useAnimatedStyle(() => ({
    opacity: leafShade(leafProgress(cover.get(), index)),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      testID={`book-leaf-${index}`}
      style={[styles.leaf, { backgroundColor: look.fill }, turn]}
    >
      <LinearGradient
        colors={[look.sheen, 'rgba(255,255,255,0)']}
        locations={[0, 1]}
        pointerEvents="none"
        style={styles.sheen}
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, shade]} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderColor: look.edge }, styles.rim]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  leaf: {
    ...StyleSheet.absoluteFill,
    borderRadius: 3,
    overflow: 'hidden',
    transformOrigin: 'left center',
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%' },
  shade: { backgroundColor: '#000000' },
  rim: { borderWidth: 1, borderRadius: 3 },
});
