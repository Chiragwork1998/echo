import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
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
import { HURRY_MS, type Ritual } from './ritual';
import { VOLUMES, type Volume } from './volumes';

// The original timings: the book comes forward in 420 ms and its cover swings in 1100 ms, hinged at
// the spine with the same deep perspective (see ./ritual for these, and how they shorten with use).
// Rising from the lower edge for the daily echo is gentler and longer, since there is no shelf to
// leave first.
const PERSPECTIVE = 1600;
const SWING = -170;
/** A book that has barely begun to rise when a tap comes appears where it is, rather than sweeping. */
const BARELY = 0.05;

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
  /** How long each part takes. It shortens as the book is opened more often (D-008). */
  ritual: Ritual;
  /** A tap said enough: whatever is left finishes together, at once, and softly. */
  hurry: boolean;
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
  ritual,
  hurry,
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

  // A book that has barely begun to rise when a tap comes appears where it is and fades in, rather
  // than sweeping up in a fraction of a second.
  const still = useSharedValue(0);
  useEffect(() => {
    if (!start || opened) return;
    const ease = Easing.out(Easing.cubic);
    const timing = (duration: number, easing = ease) => ({
      duration,
      easing,
      reduceMotion: ReduceMotion.Never,
    });
    let total: number;
    if (reduced) {
      // Reduce Motion: the book fades in already open, in the time of a blink.
      cover.set(1);
      arrive.set(withTiming(1, timing(tokens.motion.fast)));
      total = tokens.motion.fast;
    } else if (hurry) {
      cancelAnimation(arrive);
      cancelAnimation(cover);
      if (arrive.get() < BARELY) still.set(1);
      arrive.set(withTiming(1, timing(HURRY_MS)));
      cover.set(withTiming(1, timing(HURRY_MS, Easing.inOut(Easing.cubic))));
      total = HURRY_MS;
    } else {
      const first = entrance === 'rise' ? ritual.rise : ritual.forward;
      arrive.set(withTiming(1, timing(first)));
      cover.set(withDelay(first, withTiming(1, timing(ritual.cover, Easing.inOut(Easing.cubic)))));
      total = first + ritual.cover;
    }
    const done = setTimeout(() => {
      setOpened(true);
      report.current?.();
    }, total);
    return () => clearTimeout(done);
  }, [start, opened, hurry, reduced, entrance, ritual, arrive, cover, still]);

  const motion = useAnimatedStyle(() => {
    const t = arrive.get();
    return entrance === 'rise'
      ? {
          opacity: interpolate(t, [0, 0.3], [0, 1], 'clamp'),
          transform: [{ translateY: (1 - t) * riseFrom * (1 - still.get()) }],
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
