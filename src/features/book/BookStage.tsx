import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { BookCover } from './CoverArt';
import { usePaperLook, type Surface } from './paper';
import { VOLUMES, type Volume } from './volumes';

// The original timings. The book comes forward in 420 ms and its cover swings in 1100 ms, hinged at
// the spine with the same deep perspective. Rising from the lower edge for the daily echo is gentler
// and longer, since there is no shelf to leave first.
const FORWARD_MS = 420;
const RISE_MS = 1500;
export const COVER_MS = 1100;
const PERSPECTIVE = 1600;
const SWING = -170;

export type Entrance = 'rise' | 'forward';

type Props = {
  volume: Volume;
  surface: Surface;
  width: number;
  height: number;
  entrance: Entrance;
  /** The book waits unseen until this is true, then arrives and opens. */
  start: boolean;
  /** How far below its place the book begins, for `rise`. */
  riseFrom: number;
  onOpened?: () => void;
  /** The page, which is there from the first moment, and is told when the cover has opened. */
  children: (open: boolean) => ReactNode;
};

/**
 * A book arriving and opening: it comes forward (or rises), and the cloth cover swings back from the
 * spine to show the page. Reduce Motion: it fades in already open, in the time of a blink.
 */
export function BookStage({
  volume,
  surface,
  width,
  height,
  entrance,
  start,
  riseFrom,
  onOpened,
  children,
}: Props) {
  const reduced = useReduceMotion();
  const look = usePaperLook(surface);
  const arrive = useSharedValue(0);
  const cover = useSharedValue(0);
  const [opened, setOpened] = useState(false);
  const phase = !start ? 'waiting' : opened ? 'open' : 'closed';
  const report = useRef(onOpened);
  useEffect(() => {
    report.current = onOpened;
  });

  useEffect(() => {
    if (!start) return;
    // Reduce Motion: the book fades in already open, in the time of a blink.
    const first = reduced ? 0 : entrance === 'rise' ? RISE_MS : FORWARD_MS;
    const total = reduced ? tokens.motion.fast : first + COVER_MS;
    if (reduced) {
      cover.set(1);
      arrive.set(withTiming(1, { duration: tokens.motion.fast, reduceMotion: ReduceMotion.Never }));
    } else {
      arrive.set(
        withTiming(1, {
          duration: first,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.Never,
        }),
      );
      cover.set(
        withDelay(
          first,
          withTiming(1, {
            duration: COVER_MS,
            easing: Easing.inOut(Easing.cubic),
            reduceMotion: ReduceMotion.Never,
          }),
        ),
      );
    }
    const done = setTimeout(() => {
      setOpened(true);
      report.current?.();
    }, total);
    return () => clearTimeout(done);
  }, [start, reduced, entrance, arrive, cover]);

  const motion = useAnimatedStyle(() => {
    const t = arrive.get();
    return entrance === 'rise'
      ? {
          opacity: interpolate(t, [0, 0.3], [0, 1], 'clamp'),
          transform: [{ translateY: (1 - t) * riseFrom }],
        }
      : { opacity: t, transform: [{ scale: interpolate(t, [0, 1], [0.6, 1]) }] };
  }, [entrance, riseFrom]);
  const swing = useAnimatedStyle(() => ({
    transform: [
      { perspective: PERSPECTIVE },
      { rotateY: `${interpolate(cover.get(), [0, 1], [0, SWING])}deg` },
    ],
  }));

  const index = VOLUMES.indexOf(volume);
  const cloth = volume.cloth;
  const vellum = surface === 'vellum';

  return (
    <Animated.View
      style={[{ width, height }, motion]}
      pointerEvents={phase === 'open' ? 'box-none' : 'none'}
    >
      {/* The boards behind the page. Over vellum they are only a rim of cloth, so the sky shows. */}
      <View
        pointerEvents="none"
        style={[
          styles.boards,
          vellum
            ? {
                borderColor: cloth,
                borderLeftWidth: 4,
                borderTopWidth: 6,
                borderRightWidth: 10,
                borderBottomWidth: 8,
              }
            : { backgroundColor: cloth, boxShadow: '0 12px 18px rgba(0,0,0,0.45)' },
        ]}
      />
      {/* The edges of the pages, on the right and underneath. */}
      <View
        pointerEvents="none"
        style={[styles.edge, styles.edgeFar, { backgroundColor: look.leaves[1] }]}
      />
      <View
        pointerEvents="none"
        style={[styles.edge, styles.edgeNear, { backgroundColor: look.leaves[0] }]}
      />
      {children(phase === 'open')}
      <View
        pointerEvents="none"
        style={[styles.ribbon, { backgroundColor: volume.foil, opacity: look.ribbonOpacity }]}
      />
      {phase === 'closed' && !reduced && (
        <Animated.View pointerEvents="none" style={[styles.hinge, swing]}>
          <BookCover height={height} index={index} volume={volume} width={width} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  boards: {
    position: 'absolute',
    top: -6,
    right: -10,
    bottom: -8,
    left: -4,
    borderRadius: 6,
  },
  // Slivers only: they sit outside the page, so a translucent page never shows them through itself.
  edge: { position: 'absolute', top: 2, bottom: -2, borderRadius: 3 },
  edgeFar: { left: '100%', width: 7, marginLeft: -1 },
  edgeNear: { left: '100%', width: 4, marginLeft: -1 },
  ribbon: { position: 'absolute', bottom: -15, left: '20%', width: 7, height: 24, borderRadius: 1 },
  hinge: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'left center',
    backfaceVisibility: 'hidden',
  },
});
