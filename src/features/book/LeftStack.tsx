import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { EASE } from '@/design/ease';
import { mixColor } from '@/design/mixColor';

import type { PaperLook } from './paper';
import { LEAF_PITCH, leafGeometry } from './standing';
import type { ClosingState } from './useBookClosing';

/** The newest hairline comes in from this far inside the block, and takes this long. */
const SLIDE = 5;
const SLIDE_MS = { full: 480, short: 300 } as const;
/** Every fourth leaf is a little darker, so the block reads as leaves and not as a band. */
const DARKER = 0.12;
/** The block is a touch lower than the page, as the turned leaves are. */
const DROP = 2;

/** The x of hairline `index` from the page's left edge, drawn as a 1 pt line in a 1.5 pt pitch. */
const centre = (index: number) => LEAF_PITCH * (index + 0.5);

/** The hairlines of leaves from `from` to `to`, grouped by tone, as one path each. */
export function hairlines(from: number, to: number, width: number): [string, string, string] {
  const paths: [string, string, string] = ['', '', ''];
  for (let index = from; index < to; index += 1) {
    // Index 0 is next to the page; the picture reads from the outer edge, so it is mirrored.
    const x = width - centre(index);
    const tone = index % 4 === 3 ? 2 : index % 2;
    paths[tone] += `M${x} 0V100`;
  }
  return paths;
}

const toneOf = (look: PaperLook, index: number) =>
  index % 4 === 3 ? mixColor(look.leaves[index % 2]!, '#000000', DARKER) : look.leaves[index % 2]!;

type Props = {
  /** How many echoes the book holds: a count, so that a book that has been written in is thicker. */
  echoes: number;
  /** How much room there is between the page and the edge of the screen, in points. */
  room: number;
  look: PaperLook;
  /** The entry is being kept: the block is held as it is until the cover has come down. */
  keeping?: boolean;
  /** The closing: this entry's leaf is let in when the cover has come down, not before. */
  closing: ClosingState | null;
};

/**
 * The block of earlier leaves at the spine: hairlines, a point and a half apart, that thicken with the
 * echoes in the book. It is a count and nothing more. When the book is shut on a new entry and that
 * adds a leaf, the newest one slides in as the cover lands.
 */
export function LeftStack({ echoes, room, look, keeping = false, closing }: Props) {
  // The count the open page was drawn with, before this entry could be counted: the block stays as
  // it was until the cover is down. It is the last count seen while the page was open, so a save so
  // quick that it is counted in the same moment the book begins to shut is still held.
  const [held, setHeld] = useState(echoes);
  const settling = keeping || closing !== null;
  if (!settling && held !== echoes) setHeld(echoes);
  const holding = settling && !closing?.contact;
  const count = holding ? held : echoes;
  const now = leafGeometry(count, room);
  const grew =
    closing !== null &&
    closing.contact &&
    !closing.hurry &&
    !closing.reduced &&
    now.leaves > leafGeometry(held, room).leaves;
  const settled = grew ? now.leaves - 1 : now.leaves;
  const width = now.leaves * LEAF_PITCH;

  const paths = useMemo(() => hairlines(0, settled, width), [settled, width]);
  const [a, b, dark] = paths;

  const slide = useSharedValue(grew ? 0 : 1);
  const full = (closing?.ritual.close.cover ?? 560) > 400;
  useEffect(() => {
    if (!grew) return;
    slide.set(0);
    slide.set(
      withTiming(1, {
        duration: full ? SLIDE_MS.full : SLIDE_MS.short,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [grew, full, slide]);
  const newest = useAnimatedStyle(() => ({
    opacity: slide.get(),
    transform: [{ translateX: SLIDE * (1 - slide.get()) }],
  }));

  if (now.leaves === 0) return null;
  return (
    <View
      pointerEvents="none"
      testID="book-left-stack"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { left: -width, width }]}
    >
      <Svg width={width} height="100%" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
        <Path d={a} stroke={toneOf(look, 0)} strokeWidth={1} />
        <Path d={b} stroke={toneOf(look, 1)} strokeWidth={1} />
        <Path d={dark} stroke={toneOf(look, 3)} strokeWidth={1} />
      </Svg>
      {grew && (
        <Animated.View
          testID="book-left-stack-newest"
          style={[
            styles.newest,
            {
              left: width - centre(now.leaves - 1) - 0.5,
              backgroundColor: toneOf(look, now.leaves - 1),
            },
            newest,
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { position: 'absolute', top: DROP, bottom: -DROP },
  newest: { position: 'absolute', top: 0, bottom: 0, width: 1 },
});
