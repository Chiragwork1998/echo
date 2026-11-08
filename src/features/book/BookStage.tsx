import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { clamp01 } from '@/design/ease';
import { cue } from '@/design/haptics';
import { mixColor } from '@/design/mixColor';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { BookCover } from './CoverArt';
import { LeafRiffle } from './LeafRiffle';
import { usePaperLook, type Surface } from './paper';
import { coverPin, risePin } from './qaPins';
import { Ribbon } from './Ribbon';
import { HURRY_MS, type Ritual } from './ritual';
import {
  clothLightAlpha,
  clothLightAt,
  coverAngle,
  coverEdge,
  frontOpacity,
  frontShade,
  hingeOpacity,
  liningOpacity,
  liningShade,
  pageSheen,
  PERSPECTIVE,
  riffleLeaves,
  riseOpacity,
  shadowOpacity,
} from './standing';
import { VOLUMES, type Volume } from './volumes';

// The original timings: the book comes forward and its cloth cover swings in 1100 ms, hinged at the
// spine with the same deep perspective (see ./ritual for these, and how they shorten with use).
// Rising from the lower edge for the daily echo is gentler and longer, since there is no shelf to
// leave first. Everything else the opening draws is derived from how far the book has arrived (`arrive`)
// and how far the cover has swung (`cover`), in ./standing: no layer has a clock of its own.
/** A book that has barely begun to rise when a tap comes appears where it is, rather than sweeping. */
const BARELY = 0.05;
/** First Echo's book lifts out of the shelf's row: it comes this far up to its place, and a little larger. */
const FORWARD_LIFT = 22;
const FORWARD_FROM = 0.88;
/** It is fully there by this share of its arrival: a fade of about 200 ms in a ritual of 520. */
const FORWARD_VISIBLE = 0.8;
/** The cover has visibly left the page (a degree and a half) this share of its swing in. */
const UNSEAT = 0.14;
/** The page's corners. */
const PAGE_RADIUS = 3;
/** The cover's shadow reaches this far across the page from the board's free edge, as a share of its width. */
const CAST_WIDTH = 0.45;
/** The cloth's lining is the cloth, in shadow. */
const LINING_DARKER = 0.22;

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
  /** How many echoes the book holds. A count only: a book with more in it lets a few leaves riffle. */
  echoes?: number;
  onOpened?: () => void;
  /** The page, which is there from the first moment, and is told when the cover has opened. */
  children: (open: boolean) => ReactNode;
};

/**
 * A book arriving and opening: it comes forward (or rises), and the cloth cover, a board with an
 * inside, lifts from the spine, casts its shadow across the page, swings through edge-on and lies
 * open while a few leaves riffle after it. The ribbon trails the rise and is let down as the cover
 * unseats. Reduce Motion: it fades in already open, in the time of a blink, with none of that.
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
  echoes = 0,
  onOpened,
  children,
}: Props) {
  const reduced = useReduceMotion();
  const look = usePaperLook(surface);
  const arrive = useSharedValue(0);
  const cover = useSharedValue(0);
  const [opened, setOpened] = useState(false);
  // The harness can hold the opening at a moment, to look at it (./qaPins). Never set in a real app.
  const [pin] = useState(() => ({ cover: coverPin(), rise: risePin() }));
  const phase = !start ? 'waiting' : opened ? 'open' : 'closed';
  const closed = phase === 'closed' && !reduced;
  const report = useRef(onOpened);
  useEffect(() => {
    report.current = onOpened;
  });

  // A book that has barely begun to rise when a tap comes appears where it is and fades in, rather
  // than sweeping up in a fraction of a second.
  const still = useSharedValue(0);
  useEffect(() => {
    if (!start || opened) return;
    const rising = entrance === 'rise';
    // Both arrivals decelerate into place. (The shared EASE would be 90 percent done by a third of
    // the time, which is a fade of four frames and a settle nobody sees; this one stays in view.)
    const ease = Easing.out(Easing.cubic);
    const timing = (duration: number, easing = ease) => ({
      duration,
      easing,
      reduceMotion: ReduceMotion.Never,
    });
    let total: number;
    let unseat: ReturnType<typeof setTimeout> | undefined;
    if (reduced) {
      // Reduce Motion: the book fades in already open, in the time of a blink.
      cover.set(1);
      arrive.set(withTiming(1, timing(tokens.motion.fast)));
      total = tokens.motion.fast;
    } else if (pin.cover !== undefined || pin.rise !== undefined) {
      arrive.set(pin.rise ?? 1);
      cover.set(pin.cover ?? 0);
      return;
    } else if (hurry) {
      cancelAnimation(arrive);
      cancelAnimation(cover);
      if (arrive.get() < BARELY) still.set(1);
      arrive.set(withTiming(1, timing(HURRY_MS, Easing.out(Easing.cubic))));
      cover.set(withTiming(1, timing(HURRY_MS, Easing.inOut(Easing.cubic))));
      total = HURRY_MS;
    } else {
      const first = rising ? ritual.rise : ritual.forward;
      arrive.set(withTiming(1, timing(first)));
      cover.set(withDelay(first, withTiming(1, timing(ritual.cover, Easing.inOut(Easing.cubic)))));
      total = first + ritual.cover;
      // One small click as the board unseats: a book does not buzz while it rises, or while its
      // leaves riffle. It is felt once, where the cover first leaves the page: the board starts
      // from rest, so that is a little after the swing begins, not on its first frame.
      unseat = setTimeout(() => cue('tick'), first + ritual.cover * UNSEAT);
    }
    const done = setTimeout(() => {
      setOpened(true);
      report.current?.();
    }, total);
    return () => {
      clearTimeout(done);
      if (unseat) clearTimeout(unseat);
    };
  }, [start, opened, hurry, reduced, entrance, ritual, arrive, cover, still, pin]);

  const motion = useAnimatedStyle(() => {
    const t = arrive.get();
    // Reduce Motion: the book fades in where it rests. Nothing travels and nothing scales.
    if (reduced) return { opacity: t };
    const inPlace = still.get();
    if (entrance === 'rise') {
      return {
        opacity: riseOpacity(t, inPlace),
        transform: [{ translateY: (1 - t) * riseFrom * (1 - inPlace) }],
      };
    }
    const travel = 1 - inPlace;
    return {
      opacity: riseOpacity(t, inPlace, FORWARD_VISIBLE),
      transform: [
        { translateY: (1 - t) * FORWARD_LIFT * travel },
        { scale: 1 - (1 - FORWARD_FROM) * (1 - t) * travel },
      ],
    };
  }, [entrance, riseFrom, reduced]);

  // First Echo's book also lands: a contact shadow under the boards grows as it settles, and is gone
  // again by the time the cover is off, so the page rests exactly as it always has.
  const contact = useAnimatedStyle(() => {
    const t = arrive.get();
    const c = cover.get();
    return {
      opacity: 0.5 * t * (1 - clamp01(c / 0.6)),
      transform: [{ scaleX: 0.78 + 0.22 * t }],
    };
  });

  const swing = useAnimatedStyle(() => {
    const c = cover.get();
    return {
      opacity: hingeOpacity(c),
      transform: [{ perspective: PERSPECTIVE }, { rotateY: `${coverAngle(c)}deg` }],
    };
  });
  const front = useAnimatedStyle(() => ({ opacity: frontOpacity(cover.get()) }));
  const frontDark = useAnimatedStyle(() => ({ opacity: frontShade(cover.get()) }));
  const inside = useAnimatedStyle(() => ({ opacity: liningOpacity(cover.get()) }));
  const insideDark = useAnimatedStyle(() => ({ opacity: liningShade(cover.get()) }));
  const cast = useAnimatedStyle(() => {
    const c = cover.get();
    return {
      opacity: shadowOpacity(c),
      transform: [{ translateX: coverEdge(c, width) }],
    };
  }, [width]);
  const sheen = useAnimatedStyle(() => ({ opacity: pageSheen(cover.get()) }));

  const index = VOLUMES.indexOf(volume);
  const cloth = volume.cloth;
  const vellum = surface === 'vellum';
  const lining = mixColor(cloth, '#000000', LINING_DARKER);
  const leaves = reduced ? 0 : riffleLeaves(echoes);

  return (
    <Animated.View
      testID="book-stage"
      style={[{ width, height }, motion]}
      pointerEvents={phase === 'open' ? 'box-none' : 'none'}
    >
      {entrance === 'forward' && (
        <Animated.View
          pointerEvents="none"
          testID="book-contact-shadow"
          style={[styles.contact, contact]}
        />
      )}
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
      {/* A few leaves lift from the spine in the wake of the cover. */}
      {closed && <LeafRiffle active count={leaves} cover={cover} look={look} />}
      {/* What the cover does to the page as it leaves it: its shadow, and the light it uncovers. */}
      {closed && (
        <View pointerEvents="none" style={styles.pageClip}>
          <Animated.View
            pointerEvents="none"
            testID="book-cover-shadow"
            style={[styles.cast, { width: width * CAST_WIDTH }, cast]}
          >
            <LinearGradient
              colors={['rgba(26,20,12,0.5)', 'rgba(26,20,12,0)']}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            testID="book-page-sheen"
            style={[styles.sheen, sheen]}
          >
            <LinearGradient
              colors={['rgba(255,246,226,0.1)', 'rgba(255,246,226,0)']}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      )}
      <View pointerEvents="none" style={styles.ribbon}>
        <Ribbon
          arrive={reduced ? undefined : arrive}
          cover={reduced ? undefined : cover}
          foil={volume.foil}
          opacity={look.ribbonOpacity}
          testID="book-ribbon"
        />
      </View>
      {closed && (
        <Animated.View
          pointerEvents="none"
          renderToHardwareTextureAndroid
          testID="book-hinge"
          style={[styles.hinge, swing]}
        >
          <Animated.View style={front}>
            <BookCover height={height} index={index} volume={volume} width={width}>
              {entrance === 'rise' && <ClothLight arrive={arrive} height={height} width={width} />}
              <Animated.View pointerEvents="none" style={[styles.dark, frontDark]} />
            </BookCover>
          </Animated.View>
          {/* The inside of the board, which the cloth gives way to once the board is edge-on. */}
          <Animated.View
            pointerEvents="none"
            testID="book-lining"
            style={[styles.lining, { width, height, backgroundColor: lining }, inside]}
          >
            {/* The joint of the board at the spine, where the cloth bends, and its free edge. */}
            <LinearGradient
              colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)']}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={styles.liningJoint}
            />
            <View
              pointerEvents="none"
              style={[styles.liningEdge, { backgroundColor: look.leaves[0] }]}
            />
            <Animated.View pointerEvents="none" style={[styles.dark, insideDark]} />
          </Animated.View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/**
 * Light crossing the cloth as the book comes to rest: one soft diagonal band, a little over a third of
 * the cover wide, drawn plainly over the cloth inside the cover's own edge.
 */
function ClothLight({
  arrive,
  width,
  height,
}: {
  arrive: SharedValue<number>;
  width: number;
  height: number;
}) {
  const band = useAnimatedStyle(() => {
    const a = arrive.get();
    return {
      opacity: clothLightAlpha(a),
      transform: [{ translateX: clothLightAt(a) * width }, { rotate: '-14deg' }],
    };
  }, [width]);
  return (
    <Animated.View
      pointerEvents="none"
      testID="book-cloth-light"
      style={[
        styles.light,
        { left: width * 0.3, width: width * 0.4, top: -height * 0.25, height: height * 1.5 },
        band,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,248,232,0)', 'rgba(255,248,232,1)', 'rgba(255,248,232,0)']}
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
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
  contact: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: -14,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    boxShadow: '0 3px 8px rgba(0,0,0,0.5)',
  },
  // Slivers only: they sit outside the page, so a translucent page never shows them through itself.
  edge: { position: 'absolute', top: 2, bottom: -2, borderRadius: 3 },
  edgeFar: { left: '100%', width: 7, marginLeft: -1 },
  edgeNear: { left: '100%', width: 4, marginLeft: -1 },
  // Hangs from between the pages and out of the foot of the book, a fifth of the way across.
  ribbon: { position: 'absolute', bottom: -16, left: '20%' },
  hinge: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'left center',
  },
  pageClip: { ...StyleSheet.absoluteFill, borderRadius: PAGE_RADIUS, overflow: 'hidden' },
  cast: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%' },
  light: { position: 'absolute' },
  dark: { ...StyleSheet.absoluteFill, backgroundColor: '#000000' },
  lining: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    boxShadow: '4px 6px 8px rgba(0,0,0,0.4)',
  },
  // The board's free edge is on its right in its own drawing, and on its left once it lies open.
  liningEdge: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 3 },
  liningJoint: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 16 },
});
