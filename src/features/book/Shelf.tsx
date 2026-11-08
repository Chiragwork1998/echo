import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { EASE } from '@/design/ease';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { useScreenReader } from '@/features/journal-session/useScreenReader';

import { bookCopy } from './bookCopy';
import { BookCover } from './CoverArt';
import { ANIMATION_NET_MS } from './ritual';
import { Ribbon } from './Ribbon';
import { BOOK_W, STEP, VOLUMES, centred, volumeIndex, type Volume } from './volumes';

// The original shelf: eight volumes roll past over 3.2 s and settle, each growing and turning to face
// you as it crosses the centre. The drag and the settle are the original's physics, as Reanimated
// springs (stiffness 266, damping 28 is its friction 9 and tension 50).
const SHELF_HEIGHT = 300;
const PLANK = 24;
const ROLL_MS = 3200;
const SETTLE = { stiffness: 266, damping: 28, mass: 1 } as const;
const GLOW = { stiffness: 230, damping: 19, mass: 1 } as const;
const OUT_MS = 320;
/**
 * The book is asked for this far into the shelf's exit, while the shelf is still there, so that it is
 * mounted and drawing as the shelf's last light goes: asked for at the end, a slow phone showed the bare
 * studio colour between the two (190 ms on the walked emulator).
 */
export const CHOOSE_AT_MS = 100;
/** The ribbon on a shelf volume: the stage's ribbon at 4 pt wide, its tail tucked into the shut book. */
const RIBBON_W = 4;

type Props = {
  /** Where the roll ends and the shelf rests: the person's own volume, or the journal. */
  initial: number;
  /** A volume was chosen. The shelf has already begun to leave, and goes on leaving as the book comes. */
  onChoose: (index: number) => void;
  /** The shelf has finished leaving: when its own fade has ended, and nothing of it is drawn. */
  onLeft?: () => void;
  /** Where the shelf rests moves, so the backdrop can follow. */
  offset: SharedValue<number>;
};

/** Shared shelf position, so the studio colour and the shelf move together. */
export function useShelfOffset() {
  return useSharedValue(0);
}

/** Full-screen studio colour that follows whichever volume is centred. */
export function ShelfBackdrop({
  offset,
  visible,
}: {
  offset: SharedValue<number>;
  visible: SharedValue<number>;
}) {
  const { width } = useWindowDimensions();
  const { name } = useTheme();
  const fade = useAnimatedStyle(() => ({ opacity: visible.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      testID="shelf-backdrop"
      style={[StyleSheet.absoluteFill, styles.backdrop, fade]}
    >
      {VOLUMES.map((volume, index) => (
        <Scene key={volume.id} colour={volume.scene} at={centred(index, width)} offset={offset} />
      ))}
      <LinearGradient
        colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.38)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Night is the first impression: the studio is dimmed to sit with it. */}
      {name === 'night' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(2,8,20,0.34)' }]} />
      )}
    </Animated.View>
  );
}

function Scene({
  colour,
  at,
  offset,
}: {
  colour: string;
  at: number;
  offset: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(offset.get(), [at - STEP, at, at + STEP], [0, 1, 0], 'clamp'),
  }));
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colour }, style]} />;
}

/**
 * The shelf. Swipe to roll along it; tap the centred volume to choose it. Every volume is also a
 * button with its name, so a screen reader or a keyboard chooses without a gesture.
 */
export function Shelf({ initial, onChoose, onLeft, offset }: Props) {
  const { width } = useWindowDimensions();
  const reduced = useReduceMotion();
  const screenReader = useScreenReader();
  const glow = useSharedValue(0);
  const out = useSharedValue(0);
  const [settled, setReady] = useState(false);
  const ready = settled || reduced;
  const [at, setAt] = useState(initial);
  const drag = useRef({ start: 0 });
  const leaving = useRef(false);
  const chooseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const here = useRef(true);

  // A volume chosen and then left (Back within the exit) must not arrive on the screen that is going.
  // A separate effect, so that the roll's early return under Reduce Motion cannot skip it.
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
      if (chooseTimer.current) clearTimeout(chooseTimer.current);
      if (leftTimer.current) clearTimeout(leftTimer.current);
    };
  }, []);

  useEffect(() => {
    if (reduced) {
      offset.set(centred(initial, width));
      glow.set(1);
      return;
    }
    offset.set(centred(0, width));
    offset.set(
      withTiming(centred(initial, width), {
        duration: ROLL_MS,
        easing: Easing.inOut(Easing.cubic),
        reduceMotion: ReduceMotion.Never,
      }),
    );
    glow.set(withSequence(withTiming(0, { duration: ROLL_MS }), withSpring(1, GLOW)));
    const timer = setTimeout(() => setReady(true), ROLL_MS);
    return () => {
      clearTimeout(timer);
      cancelAnimation(offset);
      cancelAnimation(glow);
    };
    // The roll happens once, when the shelf appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = (index: number) => {
    const next = Math.max(0, Math.min(VOLUMES.length - 1, index));
    setAt(next);
    setReady(true);
    offset.set(withSpring(centred(next, width), { ...SETTLE, reduceMotion: ReduceMotion.Never }));
    // The hint, the halo and the lift come back as the row settles, not in one frame while it moves.
    glow.set(
      withTiming(1, {
        duration: reduced ? tokens.motion.fast : tokens.motion.standard,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  };

  const choose = (index: number) => {
    if (leaving.current) return;
    leaving.current = true;
    setAt(index);
    let said = false;
    const left = () => {
      if (said || !here.current) return;
      said = true;
      if (leftTimer.current) clearTimeout(leftTimer.current);
      onLeft?.();
    };
    if (reduced) {
      out.set(1);
      onChoose(index);
      left();
      return;
    }
    // The shelf has left when its own fade has ended, which a phone that is behind the clock reaches
    // late; and the book is asked for well before that, so that there is never a frame of neither.
    const faded = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(left)();
    };
    out.set(
      withTiming(
        1,
        {
          duration: OUT_MS,
          easing: Easing.in(Easing.cubic),
          reduceMotion: ReduceMotion.Never,
        },
        faded,
      ),
    );
    chooseTimer.current = setTimeout(() => onChoose(index), CHOOSE_AT_MS);
    leftTimer.current = setTimeout(left, OUT_MS + ANIMATION_NET_MS);
  };

  // The handlers read the drag only when a finger moves, never while rendering.
  /* eslint-disable react-hooks/refs */
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          cancelAnimation(offset);
          drag.current.start = offset.get();
          glow.set(
            withTiming(0, {
              duration: tokens.motion.fast,
              easing: EASE,
              reduceMotion: ReduceMotion.Never,
            }),
          );
        },
        onPanResponderMove: (_, g) => offset.set(drag.current.start + g.dx),
        onPanResponderRelease: (_, g) => {
          const position = drag.current.start + g.dx + g.vx * 140;
          settle(Math.round((width / 2 - BOOK_W / 2 - position) / STEP));
        },
      }),
    // settle closes over width; rebuilding with it keeps the swipe in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width],
  );
  /* eslint-enable react-hooks/refs */

  const stage = useAnimatedStyle(() => ({
    opacity: interpolate(out.get(), [0, 1], [1, 0]),
    transform: [{ scale: interpolate(out.get(), [0, 1], [1, 1.12]) }],
  }));
  const hint = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  return (
    <Animated.View style={[styles.stage, stage]}>
      <View style={styles.clip} {...swipe.panHandlers} accessibilityRole="list" testID="book-shelf">
        <View style={styles.rail} />
        <Animated.View style={[styles.row, row]}>
          {VOLUMES.map((volume, index) => (
            <ShelfSlot
              key={volume.id}
              volume={volume}
              index={index}
              width={width}
              offset={offset}
              glow={glow}
              onPress={() =>
                screenReader || (ready && index === at) ? choose(index) : settle(index)
              }
              selected={index === at}
            />
          ))}
        </Animated.View>
        <View style={styles.plank}>
          <LinearGradient colors={['#4A372B', '#21170F']} style={StyleSheet.absoluteFill} />
        </View>
      </View>
      <Animated.View style={hint}>
        <EchoText variant="caption" align="center" style={styles.hint}>
          {bookCopy.hint}
        </EchoText>
      </Animated.View>
    </Animated.View>
  );
}

function ShelfSlot(props: {
  volume: Volume;
  index: number;
  width: number;
  offset: SharedValue<number>;
  glow: SharedValue<number>;
  selected: boolean;
  onPress: () => void;
}) {
  const { volume, index, width, offset, glow, selected, onPress } = props;
  const c = centred(index, width);
  const range = [c - 2 * STEP, c - STEP, c, c + STEP, c + 2 * STEP];
  const book = useAnimatedStyle(() => {
    const x = offset.get();
    const near = interpolate(x, [c - STEP, c, c + STEP], [0, 1, 0], 'clamp');
    return {
      opacity: interpolate(x, range, [0.35, 0.9, 1, 0.9, 0.35], 'clamp'),
      transform: [
        { perspective: 1000 },
        { rotateY: `${interpolate(x, range, [16, 10, 0, -10, -16], 'clamp')}deg` },
        { scale: interpolate(x, range, [0.66, 0.78, 1, 0.78, 0.66], 'clamp') },
        { translateY: -10 * near * glow.get() },
      ],
    };
  });
  const halo = useAnimatedStyle(() => ({
    opacity: glow.get() * interpolate(offset.get(), [c - STEP, c, c + STEP], [0, 1, 0], 'clamp'),
  }));

  return (
    <View style={[styles.slot, { left: index * STEP }]}>
      <Animated.View pointerEvents="none" style={[styles.glow, halo]}>
        <Svg height="100%" viewBox="0 0 100 100" width="100%">
          <Defs>
            <RadialGradient cx="50" cy="50" id={`halo${index}`} r="50">
              <Stop offset="0" stopColor={tokens.color.night.accentWarm} stopOpacity={0.5} />
              <Stop offset="1" stopColor={tokens.color.night.accentWarm} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" fill={`url(#halo${index})`} r="50" />
        </Svg>
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={bookCopy.volume(volume.title, index + 1, VOLUMES.length)}
        accessibilityHint={bookCopy.open}
        accessibilityState={{ selected }}
        onPress={onPress}
        testID={`volume-${volume.id}`}
      >
        <Animated.View style={book}>
          <View style={{ width: BOOK_W, height: volume.height }}>
            <View style={styles.bookShadow} />
            <View style={styles.pageBlock} />
            <BookCover height={volume.height} index={index} volume={volume} width={BOOK_W} />
            <View pointerEvents="none" style={styles.bookRibbon}>
              <Ribbon foil={volume.foil} tucked width={RIBBON_W} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

export const shelfStart = volumeIndex;

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#12161D' },
  stage: { marginTop: tokens.space[64] + tokens.space[16] },
  clip: { width: '100%', height: SHELF_HEIGHT, overflow: 'hidden' },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: PLANK,
    height: 46,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  row: { position: 'absolute', left: 0, right: 0, top: 0, bottom: PLANK + 4 },
  slot: {
    position: 'absolute',
    bottom: 0,
    width: BOOK_W,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  glow: { position: 'absolute', width: 260, height: 260, bottom: -40, alignSelf: 'center' },
  plank: { position: 'absolute', left: 0, right: 0, bottom: 0, height: PLANK, overflow: 'hidden' },
  hint: { marginTop: tokens.space[20], letterSpacing: 0.6 },
  bookShadow: {
    position: 'absolute',
    left: 6,
    right: -6,
    bottom: -5,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  pageBlock: {
    position: 'absolute',
    top: 4,
    bottom: 3,
    right: -4,
    width: 6,
    borderRadius: 1,
    backgroundColor: '#EDE6D8',
  },
  // Out of the foot of the book, a third of the way across (4 by 12 pt, tail tucked 6 pt of the stage's).
  bookRibbon: { position: 'absolute', bottom: -9, left: '30%' },
});
