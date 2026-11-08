import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { Icon } from '@/components/Icon';
import { cue } from '@/design/haptics';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { Grain, usePaperLook } from '@/features/book/paper';
import type { PatternCard } from '@/services/patterns';

import { CardBack, FOIL, GildedEdge } from './CardBack';
import { hash, SCENES, sceneFor } from './scenes';

/** A playing card: 2.5 by 3.5 inches. */
export const CARD_RATIO = 7 / 5;
const RADIUS = tokens.radius.medium;
/** The card is an object, the same on either sky: its gold and cream are Night's, by day too. */
const GOLD = tokens.color.night.accentWarm;
const NAVY = '#0A1526';
const STAR = '#FFF4DF';
/** Gilt on paper: Day's warm accent, which reads as gold leaf on the book's cream. */
const GILT = tokens.color.day.accentWarm;
/** The scene's window on the face, inset from the card's edge. */
const WINDOW_INSET = 34;
const WINDOW_TOP = 42;
/** Between a screen change and the atmosphere: long enough to watch it turn, short of slow. */
const FLIP_MS = 760;
const FADE_MS = tokens.motion.fast;
/**
 * A turn eases in and out, so the card is seen edge on at its middle: ECHO's decelerating ease
 * spends nine tenths of the turn in its first tenth, and a card snapped over reads as a cut.
 */
const EASE = Easing.bezier(0.45, 0, 0.2, 1);
/** Near enough that the far edge visibly recedes: a card held at reading distance. */
const PERSPECTIVE = 1000;
/** As it turns the card lifts toward you, tips back a little, and settles. */
const LIFT = 0.05;
const RISE = 10;
const TIP = 4;
/** The side turning away from the light falls into shade, this dark when edge on. */
const SHADE = 0.55;
/** A gilded edge is seen only within this much of edge on (|cos| of the turn). */
const EDGE_SEEN = 0.2;
/** The band of light that crosses the card as it turns. */
const SHEEN = 'rgba(255,246,226,';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const NUMERALS: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** The card's place in the person's deck: I, II, III. */
export function numeral(value: number): string {
  let rest = Math.max(1, Math.min(39, Math.floor(value)));
  let out = '';
  for (const [size, mark] of NUMERALS) {
    while (rest >= size) {
      out += mark;
      rest -= size;
    }
  }
  return out;
}

/** The days the card's words were written: "NOV 3", "NOV 3 – 5", or "OCT 30 – NOV 2". */
export function daySpan(dates: readonly string[]): string {
  const days = dates
    .map((date) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(date))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ key: match[0], month: Number(match[2]) - 1, day: Number(match[3]) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return '';
  const start = `${MONTHS[first.month]} ${first.day}`;
  if (first.key === last.key) return start;
  if (first.month === last.month) return `${start} – ${last.day}`;
  return `${start} – ${MONTHS[last.month]} ${last.day}`;
}

/** The card's own constellation in the scene's sky: the same stars for the same card, always. */
export function constellation(seed: string, size: number) {
  let state = hash(seed) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const count = 5;
  return Array.from({ length: count }, (_, i) => ({
    x: size * (0.17 + (0.66 * (i + 0.15 + next() * 0.7)) / count),
    y: size * (0.08 + next() * 0.22),
    r: 1.15 + next() * 0.95,
  }));
}

function Constellation({ seed, size }: { seed: string; size: number }) {
  const stars = useMemo(() => constellation(seed, size), [seed, size]);
  return (
    <Svg width={size} height={size} style={styles.overlay} pointerEvents="none">
      {stars.slice(1).map((star, i) => {
        const from = stars[i] ?? star;
        return (
          <Line
            key={`l${i}`}
            x1={from.x}
            y1={from.y}
            x2={star.x}
            y2={star.y}
            stroke={GOLD}
            strokeWidth={0.8}
            strokeOpacity={0.62}
          />
        );
      })}
      {stars.map((star, i) => (
        <Circle key={`g${i}`} cx={star.x} cy={star.y} r={star.r * 3.4} fill={GOLD} opacity={0.18} />
      ))}
      {stars.map((star, i) => (
        <Circle key={`s${i}`} cx={star.x} cy={star.y} r={star.r} fill={STAR} />
      ))}
    </Svg>
  );
}

/** A corner index on paper: the card's numeral over ECHO's suit, the cairn. The far one is turned. */
function Index({ number, ink, far = false }: { number: number; ink: string; far?: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.index, far ? styles.indexFar : styles.indexNear]}>
      <EchoText variant="bodyM" style={[styles.rank, { color: ink }]} maxFontSizeMultiplier={1}>
        {numeral(number)}
      </EchoText>
      <Icon name="cairn-filled" size={12} color={ink} />
    </View>
  );
}

/**
 * The face, made of the book's own paper: a painted scene set in it like a window, with the card's
 * own constellation in its sky; the pattern's name in Cormorant italic; a line in the person's own
 * words; and the days they wrote them. Corner indices, as on a playing card, with the cairn as suit.
 */
function Face({ card, number, width }: { card: PatternCard; number: number; width: number }) {
  const paper = usePaperLook('paper');
  const quote = card.evidence[0]?.quote;
  const span = daySpan(card.evidence.map((item) => item.date));
  const foot = [span, 'ECHO'].filter(Boolean).join('  ·  ');
  const window = width - WINDOW_INSET * 2;
  return (
    <View style={[styles.face, { backgroundColor: paper.fill }]}>
      <Grain look={paper} />
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(255,252,244,0.5)',
          'rgba(255,252,244,0)',
          'rgba(90,70,48,0)',
          'rgba(90,70,48,0.1)',
        ]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Index number={number} ink={paper.ink} />
      <Index number={number} ink={paper.ink} far />
      <View style={[styles.window, { width: window, height: window }]}>
        <Image
          source={SCENES[sceneFor(card)]}
          style={{ width: window, height: window }}
          resizeMode="cover"
          accessible={false}
        />
        <Constellation seed={card.name} size={window} />
        <View pointerEvents="none" style={styles.windowLine} />
      </View>
      <View style={styles.words}>
        <EchoText
          variant="displayM"
          style={[styles.name, { color: paper.ink }]}
          numberOfLines={2}
          maxFontSizeMultiplier={1.1}
        >
          {card.name}
        </EchoText>
        {quote ? (
          <EchoText
            variant="bodyL"
            style={[styles.quote, { color: paper.muted }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.1}
          >
            {`“${quote}”`}
          </EchoText>
        ) : null}
        <View style={styles.divider}>
          <View style={styles.hair} />
          <View style={styles.diamond} />
          <View style={styles.hair} />
        </View>
        <EchoText
          variant="caption"
          style={[styles.foot, { color: paper.muted }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1}
        >
          {foot}
        </EchoText>
      </View>
      <GildedEdge width={width} height={width * CARD_RATIO} radius={RADIUS} id="pc-face-edge" />
    </View>
  );
}

/** One side of the card as it turns: it rotates away about the long axis, lifts and tips back. */
function useSideStyle(turned: SharedValue<number>, reduced: boolean, from: 0 | 180) {
  return useAnimatedStyle(() => {
    const t = turned.value;
    if (reduced) return { opacity: from === 0 ? 1 - t : t, transform: [] };
    const up = Math.sin(t * Math.PI);
    return {
      opacity: 1,
      transform: [
        { perspective: PERSPECTIVE },
        { translateY: -RISE * up },
        { rotateX: `${TIP * up}deg` },
        { rotateY: `${from + t * 180}deg` },
        { scale: 1 + LIFT * up },
      ],
    };
  });
}

/** The side turning from the light falls into shade, darkest edge on. */
function useShadeStyle(turned: SharedValue<number>, reduced: boolean, back: boolean) {
  return useAnimatedStyle(() => {
    const t = turned.value;
    if (reduced) return { opacity: 0 };
    const away = back ? Math.min(t, 0.5) : Math.min(1 - t, 0.5);
    return { opacity: SHADE * (1 - Math.cos(away * Math.PI)) };
  });
}

type Props = {
  card: PatternCard;
  /** Its place in the person's deck, from 1. */
  number: number;
  /** Face up shows the scene; face down shows the back every card shares. */
  faceUp: boolean;
  /** Turns the card over. */
  onTurn: () => void;
  width: number;
  /** What a screen reader says for the card. */
  spoken: string;
  /** Face up, the card is its pattern's heading; face down, a button to turn it. */
  role?: 'button' | 'header';
  hint?: string;
};

/**
 * A pattern card held like a playing card: a painted scene with its own constellation, the
 * pattern's name in Cormorant italic, a line in the person's own words, and the days they wrote
 * them. Every card shares one back. Tapping turns it over with a little lift and a soft tap felt
 * in the hand. Under Reduce Motion it cross-fades instead.
 */
export function PlayingCard({
  card,
  number,
  faceUp,
  onTurn,
  width,
  spoken,
  role = 'button',
  hint,
}: Props) {
  const reduced = useReduceMotion();
  const turned = useSharedValue(faceUp ? 1 : 0);

  useEffect(() => {
    turned.set(
      withTiming(faceUp ? 1 : 0, {
        duration: reduced ? FADE_MS : FLIP_MS,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [faceUp, reduced, turned]);

  const height = width * CARD_RATIO;

  // One turn, seen as a physical card: the side that is up rotates away about its long axis while
  // the card lifts toward the eye and tips back a little; the side turning from the light shades
  // over; a band of light crosses it; at the middle its gilded edge shows; its shadow beneath
  // spreads as it lifts and narrows as it turns edge on.
  const backStyle = useSideStyle(turned, reduced, 0);
  const faceStyle = useSideStyle(turned, reduced, 180);
  const backShade = useShadeStyle(turned, reduced, true);
  const faceShade = useShadeStyle(turned, reduced, false);

  const sheenStyle = useAnimatedStyle(() => {
    const t = turned.value;
    if (reduced) return { opacity: 0 };
    return {
      opacity: Math.sin(t * Math.PI),
      transform: [{ translateX: -width * 1.15 + t * width * 2.3 }, { rotate: '16deg' }],
    };
  });

  const edgeStyle = useAnimatedStyle(() => {
    const t = turned.value;
    if (reduced) return { opacity: 0 };
    const facing = Math.abs(Math.cos(t * Math.PI));
    const seen = facing >= EDGE_SEEN ? 0 : 1 - facing / EDGE_SEEN;
    const up = Math.sin(t * Math.PI);
    return {
      opacity: seen,
      transform: [{ translateY: -RISE * up }, { scaleY: 1 + LIFT * up }],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const t = turned.value;
    const up = reduced ? 0 : Math.sin(t * Math.PI);
    const facing = reduced ? 1 : Math.abs(Math.cos(t * Math.PI));
    return {
      opacity: 0.62 - 0.24 * up,
      transform: [
        { translateY: 14 + 16 * up },
        { scaleX: Math.max(0.16, facing) * (1 + 0.06 * up) },
        { scaleY: 1 + 0.05 * up },
      ],
    };
  });

  const turn = () => {
    cue('tick');
    onTurn();
  };

  const sheen = (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sheen,
        { width: width * 0.62, height: height * 1.5, top: -height * 0.25 },
        sheenStyle,
      ]}
    >
      <LinearGradient
        colors={[`${SHEEN}0)`, `${SHEEN}0.22)`, `${SHEEN}0.32)`, `${SHEEN}0.22)`, `${SHEEN}0)`]}
        locations={[0, 0.38, 0.5, 0.62, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      onPress={turn}
      style={[styles.card, { width, height }]}
      testID="playing-card"
    >
      <Animated.View pointerEvents="none" style={[styles.shadow, shadowStyle]}>
        <Svg width={width * 1.2} height={height * 1.12}>
          <Defs>
            <RadialGradient id="pc-shadow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset={0} stopColor="#01050C" stopOpacity={0.75} />
              <Stop offset={0.62} stopColor="#01050C" stopOpacity={0.32} />
              <Stop offset={1} stopColor="#01050C" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={width * 1.2} height={height * 1.12} fill="url(#pc-shadow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.side, backStyle]} testID="playing-card-back">
        <View style={styles.face}>
          <CardBack width={width} height={height} radius={RADIUS} />
          <GildedEdge width={width} height={height} radius={RADIUS} id="pc-back-edge" />
          {sheen}
          <Animated.View pointerEvents="none" style={[styles.shade, backShade]} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.side, faceStyle]} testID="playing-card-face">
        <View style={styles.face}>
          <Face card={card} number={number} width={width} />
          {sheen}
          <Animated.View pointerEvents="none" style={[styles.shade, faceShade]} />
        </View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.edge, edgeStyle]}>
        <LinearGradient
          colors={
            FOIL.map(([, color]) => color) as unknown as readonly [string, string, ...string[]]
          }
          locations={
            FOIL.map(([offset]) => offset) as unknown as readonly [number, number, ...number[]]
          }
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Pressable>
  );
}

const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  card: { alignSelf: 'center' },
  side: { ...fill, backfaceVisibility: 'hidden' },
  face: { flex: 1, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: NAVY },
  overlay: { position: 'absolute', top: 0, left: 0 },
  shadow: { position: 'absolute', left: '-10%', top: '-6%' },
  shade: { ...fill, backgroundColor: '#000000' },
  sheen: { position: 'absolute', left: 0 },
  edge: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: '50%',
    width: 3.4,
    marginLeft: -1.7,
    borderRadius: 1.7,
    overflow: 'hidden',
  },
  index: { position: 'absolute', alignItems: 'center', gap: 2, minWidth: 20 },
  indexNear: { top: 11, left: 10 },
  indexFar: { bottom: 11, right: 10, transform: [{ rotate: '180deg' }] },
  rank: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 17,
    lineHeight: 19,
    letterSpacing: 0.4,
  },
  window: {
    position: 'absolute',
    top: WINDOW_TOP,
    left: WINDOW_INSET,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: NAVY,
  },
  windowLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(184,149,90,0.8)',
  },
  words: {
    position: 'absolute',
    left: 30,
    right: 30,
    bottom: 22,
    alignItems: 'center',
  },
  name: {
    fontFamily: 'CormorantGaramond_400Regular_Italic',
    fontSize: 27,
    lineHeight: 31,
    textAlign: 'center',
  },
  quote: {
    fontFamily: 'CormorantGaramond_400Regular_Italic',
    fontSize: 15.5,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 120,
    gap: 7,
    marginTop: 12,
    marginBottom: 9,
  },
  hair: { flex: 1, height: 0.75, backgroundColor: GILT },
  diamond: {
    width: 4,
    height: 4,
    backgroundColor: GILT,
    transform: [{ rotate: '45deg' }],
  },
  foot: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9.5,
    lineHeight: 13,
    letterSpacing: 2,
    textAlign: 'center',
  },
});
