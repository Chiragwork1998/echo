import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReduceMotion } from '@/design/press';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

/** Paper and ink for the journal pages; page content uses these too. */
export const PAPER = {
  page: '#F2EBDD',
  ink: '#1F2733',
  muted: '#7C7466',
  rule: 'rgba(31,39,51,0.16)',
} as const;

type Art = 'contours' | 'horizon' | 'orbit' | 'peaks' | 'portal' | 'rhythm' | 'signal' | 'tides';

type Volume = {
  title: string;
  subtitle: string;
  cloth: string;
  foil: string;
  /** Studio colour behind the shelf while this volume is centred. */
  scene: string;
  art: Art;
  height: number;
  journal?: boolean;
};

/**
 * Original ECHO volumes. Each has its own cloth, foil and studio colour, so
 * the scene recolours as volumes pass the centre. The journal sits near the
 * end so the opening roll passes every other volume first.
 */
const VOLUMES: readonly Volume[] = [
  { title: 'Horizon', subtitle: 'QUIET MEASURE', cloth: '#A9C6DA', foil: '#294763', scene: '#5D84A1', art: 'horizon', height: 200 },
  { title: 'Return', subtitle: 'COMING BACK', cloth: '#273A5E', foil: '#E0925A', scene: '#1B2944', art: 'portal', height: 196 },
  { title: 'Stillness', subtitle: 'SLOW ATTENTION', cloth: '#E8763A', foil: '#FBE3C4', scene: '#B4502A', art: 'contours', height: 212 },
  { title: 'Signal', subtitle: 'WHAT RETURNS', cloth: '#D8DC5C', foil: '#1F2119', scene: '#8C9030', art: 'signal', height: 194 },
  { title: 'Orbit', subtitle: 'WIDER CIRCLES', cloth: '#2747C4', foil: '#EEF1F8', scene: '#1C3191', art: 'orbit', height: 206 },
  {
    title: 'Your Echo',
    subtitle: 'A PRIVATE JOURNAL',
    cloth: '#1E2C47',
    foil: '#E6B57A',
    scene: '#131D30',
    art: 'peaks',
    height: 214,
    journal: true,
  },
  { title: 'Rhythm', subtitle: 'DAILY PRACTICE', cloth: '#E2553F', foil: '#FBE6D6', scene: '#A83A28', art: 'rhythm', height: 198 },
  { title: 'Tides', subtitle: 'EBB AND FLOW', cloth: '#2F7F8C', foil: '#EADBC1', scene: '#1F5862', art: 'tides', height: 204 },
];

const BOOK_W = 150;
const STEP = 164;
const JOURNAL = VOLUMES.findIndex((volume) => volume.journal);
const JOURNAL_VOLUME = VOLUMES[JOURNAL]!;
const SHELF_HEIGHT = 300;
const PLANK = 24;
const ROLL_MS = 3200;
const TURN_MS = 760;
/** Edges of turned leaves on the left, nearest first; deeper leaves are darker. */
const LEAF_EDGES = ['#E4DBC9', '#D9CEB8', '#CEC2AA'] as const;

/** Row offset that puts volume `index` in the centre of a `width` screen. */
const centred = (index: number, width: number) => width / 2 - (index * STEP + BOOK_W / 2);

export type ShelfState = { offset: Animated.Value };

/** Shared shelf position, so the backdrop and the shelf move together. */
export function useJournalShelf(): ShelfState {
  const [offset] = useState(() => new Animated.Value(0));
  return { offset };
}

/** Full-screen studio colour that follows whichever volume is centred. */
export function ShelfBackdrop({ shelf }: { shelf: ShelfState }) {
  const { width } = useWindowDimensions();

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      {VOLUMES.map((volume, index) => {
        const c = centred(index, width);
        return (
          <Animated.View
            key={volume.title}
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: volume.scene,
                opacity: shelf.offset.interpolate({
                  inputRange: [c - STEP, c, c + STEP],
                  outputRange: [0, 1, 0],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
        );
      })}
      <LinearGradient
        colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.38)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

type Phase = 'shelf' | 'opening' | 'open';

/**
 * Step 7 shelf. The volumes roll past, each growing and recolouring the scene
 * as it crosses the centre, and settle on the user's journal. The shelf can be
 * swiped; tapping the centred journal brings it forward, swings the cover open
 * and shows `pages` as paper pages that turn with a swipe or the corner arrows.
 */
export function JournalShelf({
  onOpened,
  onPageChange,
  page,
  startOpen = false,
  pages,
  shelf,
}: {
  startOpen?: boolean;
  onOpened: () => void;
  /** Page to show once open; changing it turns the leaves. Every turn is reported back. */
  page?: number;
  onPageChange?: (page: number) => void;
  pages: ReactNode[];
  shelf: ShelfState;
}) {
  const { theme } = useEchoTheme();
  const reduceMotion = useReduceMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const { offset } = shelf;
  const [phase, setPhase] = useState<Phase>(startOpen ? 'open' : 'shelf');
  const [ready, setReady] = useState(false);
  const [centredIndex, setCentredIndex] = useState(JOURNAL);
  const [drag] = useState(() => ({ start: 0 }));
  const [glow] = useState(() => new Animated.Value(0));
  const [shelfOut] = useState(() => new Animated.Value(0));
  const [bookIn] = useState(() => new Animated.Value(startOpen ? 1 : 0));
  const [cover] = useState(() => new Animated.Value(startOpen ? 1 : 0));
  const bookWidth = width - tokens.layout.gutter * 2;
  // Larger text gets a taller page; the scaffold scrolls when it outgrows the screen.
  const pageHeight = Math.round(Math.min(540, Math.max(440, height * 0.6)) * Math.max(1, fontScale));

  useEffect(() => {
    if (reduceMotion || startOpen) {
      offset.setValue(centred(JOURNAL, width));
      glow.setValue(1);
      return;
    }
    offset.setValue(centred(0, width));
    const roll = Animated.sequence([
      Animated.timing(offset, {
        toValue: centred(JOURNAL, width),
        duration: ROLL_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(glow, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]);
    roll.start(() => setReady(true));
    return () => roll.stop();
  }, [glow, offset, reduceMotion, startOpen, width]);

  useEffect(() => {
    if (phase !== 'opening') {
      return;
    }
    const open = Animated.sequence([
      Animated.timing(bookIn, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cover, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    open.start(({ finished }) => {
      if (finished) {
        setPhase('open');
        onOpened();
      }
    });
    return () => open.stop();
  }, [bookIn, cover, onOpened, phase]);

  const settle = (index: number) => {
    const next = Math.max(0, Math.min(VOLUMES.length - 1, index));
    setCentredIndex(next);
    Animated.spring(offset, {
      toValue: centred(next, width),
      friction: 9,
      tension: 50,
      useNativeDriver: true,
    }).start();
    glow.setValue(next === JOURNAL ? 1 : 0);
  };

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          offset.stopAnimation((value) => {
            drag.start = value;
          });
          glow.setValue(0);
        },
        onPanResponderMove: (_, gesture) => offset.setValue(drag.start + gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          const position = drag.start + gesture.dx + gesture.vx * 140;
          settle(Math.round((width / 2 - BOOK_W / 2 - position) / STEP));
        },
      }),
    // settle closes over width; rebuilding with it keeps the swipe in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drag, glow, offset, width],
  );

  const openJournal = () => {
    if (phase !== 'shelf' || (!ready && !reduceMotion)) {
      return;
    }
    if (centredIndex !== JOURNAL) {
      settle(JOURNAL);
      return;
    }
    if (reduceMotion) {
      bookIn.setValue(1);
      cover.setValue(1);
      setPhase('open');
      onOpened();
      return;
    }
    Animated.timing(shelfOut, {
      toValue: 1,
      duration: 320,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPhase('opening'));
  };

  if (phase === 'shelf') {
    return (
      <Animated.View
        style={[
          styles.stage,
          {
            opacity: shelfOut.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ scale: shelfOut.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
          },
        ]}
      >
        <View style={styles.shelfClip} {...swipe.panHandlers}>
          <View style={styles.rail} />
          <Animated.View style={[styles.row, { transform: [{ translateX: offset }] }]}>
            {VOLUMES.map((volume, index) => {
              const c = centred(index, width);
              const range = [c - 2 * STEP, c - STEP, c, c + STEP, c + 2 * STEP];
              const book = (
                <Animated.View
                  style={{
                    opacity: offset.interpolate({
                      inputRange: range,
                      outputRange: [0.35, 0.9, 1, 0.9, 0.35],
                      extrapolate: 'clamp',
                    }),
                    transform: [
                      { perspective: 1000 },
                      {
                        rotateY: offset.interpolate({
                          inputRange: range,
                          outputRange: ['16deg', '10deg', '0deg', '-10deg', '-16deg'],
                          extrapolate: 'clamp',
                        }),
                      },
                      {
                        scale: offset.interpolate({
                          inputRange: range,
                          outputRange: [0.66, 0.78, 1, 0.78, 0.66],
                          extrapolate: 'clamp',
                        }),
                      },
                      ...(volume.journal
                        ? [{ translateY: glow.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }]
                        : []),
                    ],
                  }}
                >
                  <ShelfBook index={index} volume={volume} />
                </Animated.View>
              );
              return (
                <View key={volume.title} style={[styles.slot, { left: index * STEP }]}>
                  {volume.journal ? (
                    <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glow }]}>
                      <Svg height="100%" viewBox="0 0 100 100" width="100%">
                        <Defs>
                          <RadialGradient cx="50" cy="50" id="journalGlow" r="50">
                            <Stop offset="0" stopColor={theme.color.accentWarm} stopOpacity={0.5} />
                            <Stop offset="1" stopColor={theme.color.accentWarm} stopOpacity={0} />
                          </RadialGradient>
                        </Defs>
                        <Circle cx="50" cy="50" fill="url(#journalGlow)" r="50" />
                      </Svg>
                    </Animated.View>
                  ) : null}
                  <Pressable
                    accessibilityHint={volume.journal ? 'Opens the book so you can write or speak' : undefined}
                    accessibilityLabel={volume.journal ? 'Your journal' : `${volume.title} volume`}
                    accessibilityRole="button"
                    onPress={volume.journal ? openJournal : () => settle(index)}
                  >
                    {book}
                  </Pressable>
                </View>
              );
            })}
          </Animated.View>
          <View style={styles.plank}>
            <LinearGradient colors={['#4A372B', '#21170F']} style={StyleSheet.absoluteFill} />
          </View>
        </View>
        <Animated.Text style={[styles.hint, { color: theme.color.textPrimary, opacity: glow }]}>
          Tap your journal to open it.
        </Animated.Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.book,
        {
          opacity: bookIn,
          transform: [{ scale: bookIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        },
      ]}
    >
      {/* Boards and page edges behind the open page. */}
      <View style={[styles.boards, { backgroundColor: JOURNAL_VOLUME.cloth }]} />
      <View style={[styles.edge, styles.edgeFar]} />
      <View style={[styles.edge, styles.edgeNear]} />
      <PageStack
        initialPage={startOpen ? 1 : 0}
        height={pageHeight}
        onPageChange={onPageChange}
        page={page}
        pages={pages}
        startTurned={phase === 'open'}
      />
      <View style={[styles.ribbon, { backgroundColor: JOURNAL_VOLUME.foil }]} />
      {phase === 'opening' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.coverHinge,
            styles.hinge,
            {
              transform: [
                { perspective: 1600 },
                { rotateY: cover.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-170deg'] }) },
              ],
            },
          ]}
        >
          <BookCover height={pageHeight} index={JOURNAL} volume={JOURNAL_VOLUME} width={bookWidth} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function ShelfBook({ index, volume }: { index: number; volume: Volume }) {
  return (
    <View style={{ width: BOOK_W, height: volume.height }}>
      <View style={styles.bookShadow} />
      <View style={styles.pageBlock} />
      <BookCover height={volume.height} index={index} volume={volume} width={BOOK_W} />
      <View style={[styles.bookRibbon, { backgroundColor: volume.foil }]} />
    </View>
  );
}

/**
 * Paper pages stacked in the book. Turning forward lifts the current page off
 * its left hinge; turning back lays the previous page down again. The back of
 * a lifting page is blank paper, so the turn reads as a real leaf. Leaves
 * already turned stay visible as edges on the left, joined at the spine.
 */
function PageStack({
  height,
  pages,
  startTurned,
  initialPage = 0,
  page,
  onPageChange,
}: {
  height: number;
  pages: ReactNode[];
  startTurned: boolean;
  initialPage?: number;
  page?: number;
  onPageChange?: (page: number) => void;
}) {
  const reduceMotion = useReduceMotion();
  const [current, setCurrent] = useState(initialPage);
  const [turn, setTurn] = useState<{ from: number; to: number } | null>(null);
  const [flip] = useState(() => new Animated.Value(0));
  const last = pages.length - 1;

  const turnTo = (to: number) => {
    if (turn || to < 0 || to > last || to === current) {
      return;
    }
    // Reported as the turn starts, so the owner's page never lags behind a swipe.
    onPageChange?.(to);
    if (reduceMotion) {
      setCurrent(to);
      return;
    }
    flip.setValue(0);
    setTurn({ from: current, to });
    Animated.timing(flip, {
      toValue: 1,
      duration: TURN_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setCurrent(to);
      setTurn(null);
    });
  };

  // Once the cover is open, turn to the writing page so the first echo starts there.
  useEffect(() => {
    if (!startTurned) {
      return;
    }
    const timer = setTimeout(() => turnTo(1), 650);
    return () => clearTimeout(timer);
    // Restarts when the reduce-motion setting resolves after mount, so that turn
    // is instant too; turnTo(1) does nothing once the book is on page 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTurned, reduceMotion]);

  // A page asked for by the owner (a filled page moving on) turns like a swipe,
  // on the next frame once that page has been rendered into the stack.
  useEffect(() => {
    if (page === undefined || turn !== null || page === current) {
      return;
    }
    const frame = requestAnimationFrame(() => turnTo(page));
    return () => cancelAnimationFrame(frame);
    // turnTo reads the latest pages; only these changes should start a turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, turn, current]);

  // Claimed in the capture phase so a sideways drag over the writing turns the
  // page too, and held through the browser's text selection during the drag.
  // A drag shorter than 60 pt does not turn the page. While a phone keyboard is
  // up the drag is left to text selection; the corner arrows still turn.
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !Keyboard.isVisible() &&
          Math.abs(gesture.dx) > 18 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -60) {
            turnTo(current + 1);
          } else if (gesture.dx > 60) {
            turnTo(current - 1);
          }
        },
      }),
    // turnTo closes over current, turn and the page count; rebuilding with them keeps the swipe in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, turn, last],
  );

  const forward = turn !== null && turn.to > turn.from;
  const base = Math.min(turn ? (forward ? turn.to : turn.from) : current, last);
  const leaf = turn ? (forward ? turn.from : turn.to) : null;
  const turned = Math.min(turn ? Math.min(turn.from, turn.to) : current, LEAF_EDGES.length);
  const angle = flip.interpolate({
    inputRange: [0, 1],
    outputRange: forward ? ['0deg', '-180deg'] : ['-180deg', '0deg'],
  });
  // The blank back belongs to the same leaf on the same hinge; it shows once the
  // leaf passes upright, so a turn never ends with blank paper over the page.
  const backShown = flip.interpolate({
    inputRange: [0, 0.5, 0.501, 1],
    outputRange: forward ? [0, 0, 1, 1] : [1, 1, 0, 0],
  });
  const shade = flip.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: forward ? [0.18, 0.1, 0] : [0, 0.1, 0.18],
  });

  return (
    <View style={[styles.stack, { height }]} {...swipe.panHandlers}>
      {turned > 0 ? <View pointerEvents="none" style={[styles.spineBoard, { left: -4 - 3 * turned }]} /> : null}
      {LEAF_EDGES.slice(0, turned)
        .map((color, index) => (
          <View
            key={color}
            pointerEvents="none"
            style={[styles.turnedLeaf, { left: -3 * (index + 1), backgroundColor: color }]}
          />
        ))
        .reverse()}
      <Paper>{pages[base]}</Paper>
      {leaf !== null ? (
        <>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { opacity: shade }]} />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.hinge, { transform: [{ perspective: 1800 }, { rotateY: angle }] }]}
          >
            <Paper>{pages[leaf]}</Paper>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.hinge,
              styles.leafBack,
              { opacity: backShown, transform: [{ perspective: 1800 }, { rotateY: angle }] },
            ]}
          >
            <Paper />
          </Animated.View>
        </>
      ) : null}
      {turn === null && current > 0 ? (
        <Pressable
          accessibilityLabel="Previous page"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => turnTo(current - 1)}
          style={[styles.corner, styles.cornerLeft]}
        >
          <Text style={styles.cornerGlyph}>‹</Text>
        </Pressable>
      ) : null}
      {turn === null && current < last ? (
        <Pressable
          accessibilityLabel="Next page"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => turnTo(current + 1)}
          style={[styles.corner, styles.cornerRight]}
        >
          <Text style={styles.cornerGlyph}>›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Paper({ children }: { children?: ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.paper]}>
      {/* A fixed-width gutter: web gradients ignore the end point and span the whole view. */}
      <LinearGradient
        colors={['rgba(60,44,24,0.22)', 'rgba(60,44,24,0.05)', 'rgba(60,44,24,0)']}
        end={{ x: 1, y: 0 }}
        locations={[0, 0.4, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={styles.gutter}
      />
      {children}
    </View>
  );
}

function BookCover({ height, index, volume, width }: { height: number; index: number; volume: Volume; width: number }) {
  const s = width / BOOK_W;

  return (
    <View style={[styles.cover, { width, height, backgroundColor: volume.cloth }]}>
      <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <Pattern height="3" id="clothWeave" patternUnits="userSpaceOnUse" width="3">
            <Path d="M0 3 L3 0" opacity={0.16} stroke="#000000" strokeWidth={0.5} />
          </Pattern>
        </Defs>
        <Rect fill="url(#clothWeave)" height="100%" width="100%" />
      </Svg>
      <Svg
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={StyleSheet.absoluteFill}
        viewBox="0 0 150 210"
        width="100%"
      >
        <CoverArt volume={volume} />
      </Svg>
      <LinearGradient
        colors={['rgba(0,0,0,0.38)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.14)']}
        end={{ x: 1, y: 0 }}
        locations={[0, 0.04, 0.1, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.coverLabel,
          { color: volume.foil, fontSize: 6 * s, letterSpacing: 1.3 * s, top: 13 * s, left: 16 * s },
        ]}
      >
        {`ECHO VOLUMES  /  0${index + 1}`}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.coverTitle,
          { color: volume.foil, fontSize: 20 * s, lineHeight: 24 * s, bottom: 26 * s, left: 16 * s },
        ]}
      >
        {volume.title}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.coverLabel,
          { color: volume.foil, fontSize: 5 * s, letterSpacing: 1.2 * s, bottom: 17 * s, left: 16 * s },
        ]}
      >
        {volume.subtitle}
      </Text>
    </View>
  );
}

/** Contour rings for "Stillness", generated once. */
const CONTOURS = [1, 2, 3, 4, 5, 6, 7].map((ring) => {
  let d = '';
  for (let point = 0; point <= 48; point += 1) {
    const t = (point / 48) * Math.PI * 2;
    const r = 6 + ring * 7 + Math.sin(t * 3 + ring * 0.7) * ring * 1.1 + Math.cos(t * 5) * ring * 0.4;
    d += `${point === 0 ? 'M' : 'L'}${(75 + Math.cos(t) * r * 0.92).toFixed(1)} ${(98 + Math.sin(t) * r * 1.12).toFixed(1)} `;
  }
  return `${d}Z`;
});

function CoverArt({ volume }: { volume: Volume }) {
  const { cloth, foil } = volume;
  const line = { fill: 'none', stroke: foil, strokeLinecap: 'round' as const };

  switch (volume.art) {
    case 'horizon':
      return (
        <>
          <Path d="M100 44 A28 28 0 0 1 128 72 L100 72 Z" fill={foil} opacity={0.35} />
          <Path d="M28 158 A22 22 0 0 1 50 136 L50 158 Z" fill={foil} opacity={0.3} />
          <Circle cx="75" cy="98" r="40" {...line} strokeWidth={0.8} />
          <Circle cx="75" cy="98" r="8" {...line} strokeWidth={1.4} />
          <Path d="M75 42 L50 162 M75 42 L100 162" {...line} strokeWidth={2.4} />
          <Circle cx="75" cy="37" r="5" {...line} strokeWidth={2} />
          <Path d="M75 86 L78 95 L87 98 L78 101 L75 110 L72 101 L63 98 L72 95 Z" fill={foil} />
        </>
      );
    case 'portal':
      return (
        <>
          <Path d="M75 18 V50 M75 168 V196 M18 108 H34 M116 108 H132" stroke={foil} strokeDasharray="2 3" strokeWidth={0.9} />
          <Rect fill="#EFE7DA" height="104" rx="3" width="72" x="39" y="56" />
          {[1, 2, 3, 4].map((step) => (
            <Rect
              fill="none"
              height={104 - step * 14}
              key={step}
              rx="2"
              stroke="#C9BCA6"
              strokeWidth={0.8}
              width={72 - step * 10}
              x={39 + step * 5}
              y={56 + step * 7}
            />
          ))}
          <Rect fill={cloth} height="30" width="22" x="64" y="93" />
          <Rect fill={foil} height="3" width="3" x="58" y="64" />
          <Rect fill={foil} height="3" width="3" x="89" y="64" />
          <Rect fill={foil} height="3" width="3" x="58" y="150" />
          <Rect fill={foil} height="3" width="3" x="89" y="150" />
        </>
      );
    case 'contours':
      return (
        <>
          {CONTOURS.map((d, ring) => (
            <Path d={d} key={d} {...line} opacity={1 - ring * 0.09} strokeWidth={1.1} />
          ))}
          <Path d="M75 70 C70 90, 82 104, 74 128 C68 146, 80 152, 75 166" {...line} strokeWidth={1.2} />
          <Circle cx="75" cy="68" fill={foil} r="5" />
        </>
      );
    case 'signal':
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((stripe) => (
            <Path
              d={`M${22 + stripe * 8} 170 L${78 + stripe * 8} 82`}
              key={stripe}
              {...line}
              opacity={0.25 + stripe * 0.12}
              strokeWidth={1.4}
            />
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((row) =>
            Array.from({ length: row + 1 }, (_, col) => (
              <Rect fill={foil} height="5" key={`${row}-${col}`} width="5" x={78 + col * 6} y={52 + row * 6} />
            )),
          )}
        </>
      );
    case 'orbit':
      return (
        <>
          <Ellipse cx="75" cy="100" rx="56" ry="14" {...line} strokeWidth={0.8} transform="rotate(-12 75 100)" />
          <Path d="M75 22 V188" stroke={foil} strokeDasharray="1 4" strokeWidth={1} />
          {[58, 100, 142].map((y) => (
            <Path d={`M46 ${y - 6} L108 ${y - 16} L104 ${y + 6} L42 ${y + 16} Z`} fill={foil} key={y} opacity={0.92} />
          ))}
          {[58, 100, 142].map((y) => (
            <Ellipse cx="75" cy={y} fill={cloth} key={`hole-${y}`} rx="14" ry="5" transform={`rotate(-10 75 ${y})`} />
          ))}
          <Circle cx="118" cy="92" fill={foil} r="3" />
          <Circle cx="34" cy="112" fill={foil} r="2" />
        </>
      );
    case 'peaks':
      return (
        <>
          <Path d="M22 132 L56 78 L74 104 L98 62 L128 132 Z" fill={foil} opacity={0.12} />
          <Path d="M22 132 L56 78 L74 104 L98 62 L128 132" {...line} strokeWidth={1.8} />
          <Path d="M32 132 H118" {...line} strokeWidth={1} />
          <Circle cx="106" cy="44" fill={foil} r="9" />
          <Circle cx="40" cy="48" fill={foil} r="1.3" />
          <Circle cx="62" cy="36" fill={foil} r="1" />
          <Circle cx="82" cy="52" fill={foil} r="1.2" />
          <Path d="M75 140 V176" stroke={foil} strokeDasharray="1 4" strokeWidth={1} />
        </>
      );
    case 'rhythm':
      return (
        <>
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <Circle cx={30 + col * 10} cy={40 + row * 10} fill={foil} key={`${row}-${col}`} r="1.8" />
            )),
          )}
          <Path d="M38 112 A37 37 0 0 1 112 112 Z" fill={foil} />
          <Path d="M75 112 L75 75 A37 37 0 0 1 112 112 Z" fill="#7A2A1E" />
          <Circle cx="75" cy="112" fill="none" r="15" stroke={cloth} strokeWidth={4} />
          <Circle cx="75" cy="112" fill={cloth} r="6" />
          <Path d="M50 142 A25 25 0 0 0 100 142" {...line} strokeWidth={4} />
          <Rect fill="#3A1A14" height="11" width="11" x="104" y="146" />
          <Path d="M28 168 H122 M28 176 H122" {...line} opacity={0.4} strokeWidth={0.6} />
        </>
      );
    case 'tides':
      return (
        <>
          {[0, 1, 2, 3, 4].map((row) => {
            const y = 70 + row * 16;
            return (
              <Path
                d={`M22 ${y} Q 36 ${y - 9} 50 ${y} T 78 ${y} T 106 ${y} T 128 ${y}`}
                key={row}
                {...line}
                opacity={1 - row * 0.14}
                strokeWidth={1.3}
              />
            );
          })}
          <Circle cx="104" cy="46" fill={foil} r="6" />
        </>
      );
  }
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#12161D' },
  stage: { marginTop: tokens.space[64] + tokens.space[16], marginHorizontal: -tokens.layout.gutter },
  shelfClip: { width: '100%', height: SHELF_HEIGHT, overflow: 'hidden' },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: PLANK,
    height: 46,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  row: { position: 'absolute', left: 0, right: 0, top: 0, bottom: PLANK + 4 },
  slot: { position: 'absolute', bottom: 0, width: BOOK_W, alignItems: 'center', justifyContent: 'flex-end' },
  glow: { position: 'absolute', width: 260, height: 260, bottom: -40, alignSelf: 'center' },
  plank: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: PLANK,
    overflow: 'hidden',
  },
  hint: {
    marginTop: tokens.space[20],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size + 1,
    lineHeight: tokens.typography.caption.lineHeight + 3,
    textAlign: 'center',
  },
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
  bookRibbon: { position: 'absolute', bottom: -9, left: '30%', width: 4, height: 12, borderRadius: 1 },
  book: { marginTop: tokens.space[12], marginBottom: tokens.space[16] },
  boards: {
    position: 'absolute',
    top: -6,
    right: -10,
    bottom: -8,
    left: -4,
    borderRadius: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  edge: { position: 'absolute', top: 2, bottom: -2, borderRadius: 3, backgroundColor: '#E4DBC9' },
  edgeFar: { left: 6, right: -7, backgroundColor: '#D9CEB8' },
  edgeNear: { left: 3, right: -4 },
  ribbon: { position: 'absolute', bottom: -26, left: '62%', width: 8, height: 34, borderRadius: 1 },
  stack: { borderRadius: 3 },
  /** Board under the turned leaves, so they rest on the cover like the right-hand edges. */
  spineBoard: {
    position: 'absolute',
    top: -6,
    bottom: -8,
    width: 24,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    backgroundColor: JOURNAL_VOLUME.cloth,
  },
  turnedLeaf: { position: 'absolute', top: 2, bottom: -2, width: 24, borderRadius: 3 },
  paper: { backgroundColor: PAPER.page, borderRadius: 3, overflow: 'hidden' },
  gutter: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 42 },
  leafBack: { backfaceVisibility: 'visible' },
  shade: { backgroundColor: '#1A140C', borderRadius: 3 },
  hinge: { transformOrigin: 'left center', backfaceVisibility: 'hidden' },
  coverHinge: { position: 'absolute', top: 0, left: 0 },
  corner: {
    position: 'absolute',
    bottom: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerLeft: { left: 10 },
  cornerRight: { right: 8 },
  cornerGlyph: { color: PAPER.muted, fontSize: 26, lineHeight: 28 },
  cover: {
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 4, height: 6 },
    elevation: 6,
  },
  coverLabel: { position: 'absolute', right: 8, ...tokens.type.ui, opacity: 0.85 },
  coverTitle: { position: 'absolute', right: 8, ...tokens.type.display },
});
