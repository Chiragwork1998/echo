import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
  type WithTimingConfig,
} from 'react-native-reanimated';

import { EASE, clamp01 } from '@/design/ease';
import { cue } from '@/design/haptics';
import { mixColor } from '@/design/mixColor';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { useUiBegun, watchAnimation } from './animationEnd';
import { BookCover, type Inscribing } from './CoverArt';
import { LeafRiffle } from './LeafRiffle';
import { usePaperLook, type Surface } from './paper';
import { coverPin, risePin } from './qaPins';
import { Ribbon } from './Ribbon';
import { CLOSE_REDUCED_MS, HURRY_MS, type Ritual } from './ritual';
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
  coverHurry,
  riffleLeaves,
  riseOpacity,
  shadowOpacity,
  SINK,
} from './standing';
import type { ClosingState } from './useBookClosing';
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
/**
 * The cover has visibly left the page, a degree and a half or so, when it has swung this far (0 to 1):
 * the swing's in-and-out curve reaches it 14 percent of its time in.
 */
const UNSEATED = 4 * 0.14 ** 3;
/** The page's corners. */
const PAGE_RADIUS = 3;
/** The cover's shadow reaches this far across the page from the board's free edge, as a share of its width. */
const CAST_WIDTH = 0.45;
/** The cloth's lining is the cloth, in shadow. */
const LINING_DARKER = 0.22;
/** The light along the board's top edge as it lands is this bright at its brightest. */
const GLINT = 0.35;
/**
 * The board coming back: it lifts gently from lying open, rises edge-on as the last leaf goes, and
 * comes down to land softly. The decelerating EASE would start it at full speed, so the board, which
 * leaves the screen as it comes to rest, would appear in two frames; the opening's in-and-out curve
 * would leave the page bare for a beat between the leaf and the cover.
 */
const SHUT = Easing.bezier(0.3, 0, 0.2, 1);

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
  /** The entry is being kept: the cover is built now, unseen, so that the closing does not have to. */
  preparing?: boolean;
  /** The book is shutting: the cover returns, rests, and the book sinks (./useBookClosing). */
  closing?: ClosingState | null;
  /** Whose book it is: on the cover, in foil. */
  name?: string | null;
  /** The closed book being asked whose it is, and answering (./NamePrompt.tsx). */
  inscribing?: Inscribing | null;
  /** The name has been stamped on the cover. */
  onStamped?: () => void;
  onOpened?: () => void;
  /**
   * The book has drawn its first frame: it has been laid out, and the UI thread has run a frame since it was
   * mounted. Said once. The shelf is kept until then (./Shelf), so that the screen is never without both.
   */
  onDrawn?: () => void;
  /**
   * The closing: the cover has come down, as its own animation ends (see ./useBookClosing). A UI thread
   * that never says so is let go of a net after the cover was due, counted from its first frame.
   */
  onLanded?: () => void;
  /**
   * The closing: the book has begun to sink, as the UI thread takes the sink up, however late that is.
   * The next screen is asked for as it does, when a tap has hurried the closing.
   */
  onSinkBegun?: () => void;
  /**
   * The page, which is there from the first moment, and is told when the cover has opened and when
   * it has swung far enough off the page for the page's own head to arrive (`headed`).
   */
  children: (open: boolean, headed: boolean) => ReactNode;
};

/** The page's head arrives once the cover has swung this far: past edge-on, the page is uncovered. */
const HEAD_AT = 0.7;

/** How far the cover has got, as the three things that follow it see it: moving, off the page, off it well. */
function swungTo(c: number): number {
  'worklet';
  return c <= 0 ? 0 : c < UNSEATED ? 1 : c < HEAD_AT ? 2 : 3;
}

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
  preparing = false,
  closing = null,
  name = null,
  inscribing = null,
  onStamped,
  onOpened,
  onDrawn,
  onLanded,
  onSinkBegun,
  children,
}: Props) {
  const reduced = useReduceMotion();
  const look = usePaperLook(surface);
  const arrive = useSharedValue(0);
  const cover = useSharedValue(0);
  const [opened, setOpened] = useState(false);
  const [headed, setHeaded] = useState(false);
  // The count of leaves that riffle, taken as the cover begins to swing: a count that arrives later
  // does not add or take away a leaf in the middle of its turn.
  const [latched, setLatched] = useState<number | null>(null);
  const counted = useRef(echoes);
  useEffect(() => {
    counted.current = echoes;
  });
  // The harness can hold the opening at a moment, to look at it (./qaPins). Never set in a real app.
  const [pin] = useState(() => ({ cover: coverPin(), rise: risePin() }));
  const phase = !start ? 'waiting' : closing ? 'closing' : opened ? 'open' : 'closed';
  const closed = phase === 'closed' && !reduced;
  // The cover is there, unseen, from the moment the entry is being kept: building two pictures on
  // the frame the closing starts would be the one hitch in it.
  const covering = !reduced && (phase === 'closed' || phase === 'closing' || (preparing && opened));
  const report = useRef(onOpened);
  const reportDrawn = useRef(onDrawn);
  const reportLanded = useRef(onLanded);
  const reportSinking = useRef(onSinkBegun);
  useEffect(() => {
    report.current = onOpened;
    reportDrawn.current = onDrawn;
    reportLanded.current = onLanded;
    reportSinking.current = onSinkBegun;
  });
  const hasLanded = useCallback(() => reportLanded.current?.(), []);
  const hasSunk = useCallback(() => reportSinking.current?.(), []);
  // Says, from the UI thread's first frame, that what was just set has begun. The nets are set from it.
  const begun = useUiBegun();

  // The book's first frame: it has been laid out, and the UI thread has run a frame since it was mounted. That
  // is said once, to whatever is being kept on screen until then. A beat of its own, since another asker's
  // beat would replace it. (Neither signal is a clock: a book that is slow to mount is waited for as long as it
  // takes, and the one waiting has its own last word.)
  const firstFrame = useUiBegun();
  const seen = useRef({ laidOut: false, ran: false, told: false });
  const tellDrawn = useCallback(() => {
    const now = seen.current;
    if (now.told || !now.laidOut || !now.ran) return;
    now.told = true;
    reportDrawn.current?.();
  }, []);
  useEffect(() => {
    firstFrame(() => {
      seen.current.ran = true;
      tellDrawn();
    });
  }, [firstFrame, tellDrawn]);
  const laidOut = useCallback(() => {
    seen.current.laidOut = true;
    tellDrawn();
  }, [tellDrawn]);

  // The leaves that riffle are counted as the cover begins to move, and kept.
  const latchLeaves = useCallback(
    () => setLatched((count) => count ?? riffleLeaves(counted.current)),
    [],
  );
  const feelUnseating = useCallback(() => cue('tick'), []);
  // The unseating is felt once, in a full ritual: a tap, or a practised hand, does not unseat it softly.
  const unseating = useSharedValue(0);
  // What follows the cover is read from the cover, where it is drawn, and not from a clock. The UI
  // thread can be behind the wall clock by a second on a slow phone, and a timer would then call the
  // cover moving, unseated or off the page while it had not yet begun.
  useAnimatedReaction(
    () => swungTo(cover.get()),
    (now, before) => {
      const was = before ?? 0;
      if (now >= 1 && was < 1) runOnJS(latchLeaves)();
      if (now >= 2 && was < 2 && unseating.get() === 1) runOnJS(feelUnseating)();
      if (now >= 3 && was < 3) runOnJS(setHeaded)(true);
    },
  );

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
    if (!reduced && (pin.cover !== undefined || pin.rise !== undefined)) {
      unseating.set(0);
      arrive.set(pin.rise ?? 1);
      cover.set(pin.cover ?? 0);
      return;
    }
    let live = true;
    let latch: ReturnType<typeof setTimeout> | undefined;
    // The opening is over when the cover's own animation says so, and not when a clock does: the hinge,
    // the board's lining, its shadow, the sheen and the leaves belong to that swing, and stay until then.
    // The UI thread of a slow phone begins the swing seconds after JS asks for it.
    const finish = () => {
      if (!live) return;
      live = false;
      setOpened(true);
      setHeaded(true);
      report.current?.();
    };
    const first = rising ? ritual.rise : ritual.forward;
    const total = reduced ? tokens.motion.fast : hurry ? HURRY_MS : first + ritual.cover;
    const watch = watchAnimation(total, finish);
    // Run by the UI thread when the animation ends. A swing that finished, and one that something else
    // cancelled, are both over, and nothing more will come from it: a swing that THIS run replaced (a tap,
    // Reduce Motion switched on) is reported by the run that replaced it, and the run it replaced has been
    // cancelled, so what it says is not heard.
    const { ended } = watch;
    const landed = () => {
      'worklet';
      runOnJS(ended)();
    };
    unseating.set(0);
    if (reduced) {
      // Reduce Motion: the book fades in already open, in the time of a blink.
      cover.set(1);
      arrive.set(withTiming(1, timing(tokens.motion.fast), landed));
    } else if (hurry) {
      cancelAnimation(arrive);
      cancelAnimation(cover);
      if (arrive.get() < BARELY) still.set(1);
      const from = cover.get();
      // A cover already moving carries on and decelerates; one still at rest starts gently.
      const carried = coverHurry(from) === 'out';
      arrive.set(withTiming(1, timing(HURRY_MS, Easing.out(Easing.cubic))));
      cover.set(
        withTiming(
          1,
          timing(HURRY_MS, carried ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic)),
          landed,
        ),
      );
      latch = setTimeout(latchLeaves, 0);
    } else {
      arrive.set(withTiming(1, timing(first)));
      cover.set(
        withDelay(first, withTiming(1, timing(ritual.cover, Easing.inOut(Easing.cubic)), landed)),
      );
      // One small click as the board unseats: a book does not buzz while it rises, or while its
      // leaves riffle. It is felt once, where the cover first leaves the page: the board starts
      // from rest, so that is a little after the swing begins, not on its first frame.
      unseating.set(1);
    }
    // The net is set when the UI thread has begun this, and a backstop stands behind it for a UI thread
    // that never does: neither is the clock of the swing.
    begun(watch.began);
    return () => {
      live = false;
      watch.cancel();
      if (latch) clearTimeout(latch);
    };
  }, [
    start,
    opened,
    hurry,
    reduced,
    entrance,
    ritual,
    arrive,
    cover,
    still,
    pin,
    unseating,
    latchLeaves,
    begun,
  ]);

  // The closing: the cover comes back down about the spine, lands softly, and the book sinks as the
  // next screen comes. Like the opening, every layer is a function of how far the cover has swung.
  const sink = useSharedValue(0);
  const glint = useSharedValue(0);
  const tuck = useSharedValue(0);
  const shutting = closing !== null;
  const shutHurry = closing?.hurry ?? false;
  const shutReduced = closing?.reduced ?? false;
  const shutRitual = closing?.ritual;
  const shutAsking = closing?.asking ?? false;
  // The UI thread has begun the sink itself, from the cover's landing (set by the landing, on that thread).
  const sinkBegunHere = useSharedValue(0);
  useEffect(() => {
    if (!shutting || shutReduced || !shutRitual) return;
    const { close } = shutRitual;
    const timing = (duration: number, easing: WithTimingConfig['easing'] = EASE) => ({
      duration,
      easing,
      reduceMotion: ReduceMotion.Never,
    });
    const landing = close.coverAt + close.cover;
    // The cover's own landing, which the closing waits for: that is when it is felt, and when the next
    // screen is asked for. The UI thread can be a second or two behind the clock, and a timer would call
    // it down in the air: so the net is set from the descent's first frame, and not before.
    const watch = watchAnimation(shutHurry ? HURRY_MS : landing, hasLanded);
    const { ended } = watch;
    const down = () => {
      'worklet';
      runOnJS(ended)();
    };
    // The book sinks from the landing, on the UI thread, and not when JS has heard of it and has had its turn:
    // the next screen is asked for at the landing, and JS then spends a quarter of a second to most of a second
    // mounting it, in which a sink that waited on a JS timer sat resting (0.4 to 1 s on the walked emulator,
    // where the ritual means 40 to 80 ms). So the descent's own end begins it, after the rest. Not for one that
    // something cancelled (a tap hurries the book), and not while the closed book is being asked something:
    // that sinks when it is answered, which only JS knows.
    const rest = close.gap;
    const sinkMs = close.sink;
    const landed = (finished?: boolean) => {
      'worklet';
      runOnJS(ended)();
      if (!finished) return;
      sinkBegunHere.set(1);
      sink.set(
        withDelay(
          rest,
          withTiming(1, { duration: sinkMs, easing: EASE, reduceMotion: ReduceMotion.Never }),
        ),
      );
    };
    if (shutHurry) {
      cancelAnimation(cover);
      cancelAnimation(glint);
      cancelAnimation(tuck);
      glint.set(0);
      cover.set(withTiming(0, timing(HURRY_MS), down));
      tuck.set(withTiming(1, timing(HURRY_MS)));
    } else {
      cover.set(
        withDelay(
          close.coverAt,
          withTiming(0, timing(close.cover, SHUT), shutAsking ? down : landed),
        ),
      );
      // The light along the board's edge comes and goes in the last of its time; the ribbon's tail is
      // drawn up as the pages are pressed.
      glint.set(
        withDelay(
          landing - close.glint,
          withSequence(
            withTiming(1, timing(close.glint * 0.4, Easing.out(Easing.quad))),
            withTiming(0, timing(close.glint * 0.6, Easing.inOut(Easing.quad))),
          ),
        ),
      );
      tuck.set(withDelay(landing - close.tuck, withTiming(1, timing(close.tuck))));
    }
    begun(watch.began);
    return () => watch.cancel();
  }, [
    shutting,
    shutHurry,
    shutReduced,
    shutRitual,
    shutAsking,
    cover,
    glint,
    tuck,
    sink,
    sinkBegunHere,
    hasLanded,
    begun,
  ]);
  const sinking = closing?.sinking ?? false;
  useEffect(() => {
    if (!sinking || !shutRitual) return;
    const duration = shutReduced ? CLOSE_REDUCED_MS : shutHurry ? HURRY_MS : shutRitual.close.sink;
    let live = true;
    // The sink the cover's landing began, on the UI thread, goes on as it is: begun again from here it would
    // start over, and take its whole time again. (A hurried closing is a new sink of its own.) It is still told
    // that the UI thread has taken it up, as it was asked to.
    if (shutHurry || sinkBegunHere.get() !== 1) {
      sink.set(
        withTiming(1, {
          duration,
          easing: shutReduced ? Easing.out(Easing.quad) : EASE,
          reduceMotion: ReduceMotion.Never,
        }),
      );
    }
    // The closing is told when the UI thread has taken the sink up. A hurried closing asks for the next
    // screen then, so that it arrives as the book goes: it does not wait for the book to be gone.
    begun(() => {
      if (live) hasSunk();
    });
    return () => {
      live = false;
    };
  }, [sinking, shutHurry, shutReduced, shutRitual, sink, sinkBegunHere, hasSunk, begun]);

  const motion = useAnimatedStyle(() => {
    const t = arrive.get();
    // The book going: it sinks a little, settles a little smaller, and is gone.
    const gone = sink.get();
    // Reduce Motion: the book fades in where it rests. Nothing travels and nothing scales. That is said,
    // and not left unsaid: a style that stops mentioning `transform` leaves the last one it mentioned on
    // the native view, and the system's answer comes after the first draw, which began the book below the
    // screen. Left unsaid, the book would fade in at the foot of the sky and nothing would bring it up.
    if (reduced) return { opacity: t * (1 - gone), transform: [{ translateY: 0 }, { scale: 1 }] };
    const inPlace = still.get();
    const settle = 1 - SINK.scale * gone;
    if (entrance === 'rise') {
      const travel = { translateY: (1 - t) * riseFrom * (1 - inPlace) + SINK.drop * gone };
      return {
        opacity: riseOpacity(t, inPlace) * (1 - gone),
        // It is only sinking that scales it.
        transform: gone > 0 ? [travel, { scale: settle }] : [travel],
      };
    }
    const travel = 1 - inPlace;
    return {
      opacity: riseOpacity(t, inPlace, FORWARD_VISIBLE) * (1 - gone),
      transform: [
        { translateY: (1 - t) * FORWARD_LIFT * travel + SINK.drop * gone },
        { scale: (1 - (1 - FORWARD_FROM) * (1 - t) * travel) * settle },
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
  const edgeLight = useAnimatedStyle(() => ({ opacity: GLINT * glint.get() }));

  const index = VOLUMES.indexOf(volume);
  const cloth = volume.cloth;
  const vellum = surface === 'vellum';
  const lining = mixColor(cloth, '#000000', LINING_DARKER);
  const leaves = reduced ? 0 : (latched ?? riffleLeaves(echoes));

  return (
    <Animated.View
      testID="book-stage"
      onLayout={laidOut}
      style={[{ width, height }, motion]}
      pointerEvents={phase === 'open' ? 'box-none' : 'none'}
      // The book is a page, a cover and boards, one over another, and arrives (and sinks) with an
      // opacity. On Android each child would be faded by itself and the words would show through the
      // cloth; this fades the book as one picture, and costs nothing while its opacity is 1.
      needsOffscreenAlphaCompositing
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
      {children(
        phase === 'open' || phase === 'closing',
        headed || opened || (pin.cover ?? 0) >= HEAD_AT,
      )}
      {/* A few leaves lift from the spine in the wake of the cover. */}
      {closed && <LeafRiffle count={leaves} cover={cover} look={look} />}
      {/* What the cover does to the page as it leaves it: its shadow, and the light it uncovers. */}
      {covering && (
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
          tuck={shutting && !reduced ? tuck : undefined}
          foil={volume.foil}
          opacity={look.ribbonOpacity}
          testID="book-ribbon"
        />
      </View>
      {/* Reduce Motion (or a screen reader) with a question to ask: the closed cover simply is. */}
      {(reduced || shutReduced) && closing?.asking && closing.contact && (
        <StillCover
          height={height}
          index={index}
          volume={volume}
          width={width}
          inscribing={inscribing}
          onStamped={onStamped}
        />
      )}
      {covering && (
        <Animated.View pointerEvents="none" testID="book-hinge" style={[styles.hinge, swing]}>
          <Animated.View style={front}>
            <BookCover
              height={height}
              index={index}
              volume={volume}
              width={width}
              name={name}
              inscribing={inscribing}
              onStamped={onStamped}
            >
              {entrance === 'rise' && <ClothLight arrive={arrive} height={height} width={width} />}
              <Animated.View pointerEvents="none" style={[styles.dark, frontDark]} />
              {/* The board's top edge catches the light as it lands. */}
              <Animated.View
                pointerEvents="none"
                testID="book-edge-light"
                style={[styles.edgeLight, edgeLight]}
              />
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
 * The closed cover under Reduce Motion, while the book is asked whose it is: it fades in where the book
 * is, and a name, once written, comes in on a second face over it, so the title never jumps.
 */
function StillCover({
  height,
  index,
  volume,
  width,
  inscribing,
  onStamped,
}: {
  height: number;
  index: number;
  volume: Volume;
  width: number;
  inscribing: Inscribing | null;
  onStamped?: () => void;
}) {
  const shown = useSharedValue(0);
  const named = useSharedValue(0);
  const written = inscribing?.phase === 'stamp' ? inscribing.name : null;
  useEffect(() => {
    shown.set(withTiming(1, { duration: tokens.motion.fast, reduceMotion: ReduceMotion.Never }));
  }, [shown]);
  const report = useRef(onStamped);
  useEffect(() => {
    report.current = onStamped;
  });
  useEffect(() => {
    if (!written) return;
    named.set(withTiming(1, { duration: tokens.motion.fast, reduceMotion: ReduceMotion.Never }));
    const timer = setTimeout(() => report.current?.(), tokens.motion.fast);
    return () => clearTimeout(timer);
  }, [named, written]);
  const plain = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const signed = useAnimatedStyle(() => ({ opacity: named.get() }));
  return (
    <Animated.View pointerEvents="none" testID="book-still-cover" style={[styles.hinge, plain]}>
      <BookCover height={height} index={index} volume={volume} width={width} still />
      {written && (
        <Animated.View style={[StyleSheet.absoluteFill, signed]}>
          <BookCover
            height={height}
            index={index}
            volume={volume}
            width={width}
            name={written}
            still
          />
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
  edgeLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgb(255,246,226)',
  },
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
