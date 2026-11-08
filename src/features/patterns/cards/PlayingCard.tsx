import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
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
/** Far enough that the turn reads as a card in the hand, near enough to feel its depth. */
const PERSPECTIVE = 1400;
/** The card lifts a little as it turns, and settles. */
const LIFT = 0.035;
/** The inner gold line, this far inside the card's edge. */
const INSET = 12;
/** Ripples on the back: the echo, going out from the cairn. */
const RINGS = [34, 47, 62, 79, 98, 119, 142, 167, 194, 223, 254];
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

/** The fine gold line just inside the card's edge, over the scene and the plate alike. */
function InnerLine() {
  return <View pointerEvents="none" style={styles.inner} />;
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
    <View style={[styles.face, styles.paper, { backgroundColor: paper.fill }]}>
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
    </View>
  );
}

/** The back every card shares: navy, gold, and the echo rippling out from a cairn. */
function Back({ width }: { width: number }) {
  const height = width * CARD_RATIO;
  const field = { width: width - INSET * 2, height: height - INSET * 2 };
  const cx = field.width / 2;
  const cy = field.height / 2;
  return (
    <View style={styles.face}>
      <LinearGradient
        colors={['#14294A', '#0B1A33', '#060E1D']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.field}>
        <Svg width={field.width} height={field.height}>
          <Defs>
            <RadialGradient id="echo-card-glow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={GOLD} stopOpacity={0.22} />
              <Stop offset="0.6" stopColor={GOLD} stopOpacity={0.05} />
              <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={field.width} height={field.height} fill="url(#echo-card-glow)" />
          {RINGS.map((r, i) => (
            <Circle
              key={r}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={GOLD}
              strokeWidth={0.8}
              strokeOpacity={Math.max(0.05, 0.42 - i * 0.036)}
            />
          ))}
        </Svg>
      </View>
      <View pointerEvents="none" style={styles.emblem}>
        <Icon name="cairn-filled" size={30} color={GOLD} />
      </View>
      <View pointerEvents="none" style={styles.markRow}>
        <EchoText variant="caption" style={styles.mark} maxFontSizeMultiplier={1}>
          ECHO
        </EchoText>
      </View>
      <InnerLine />
    </View>
  );
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

  const backStyle = useAnimatedStyle(() => {
    const t = turned.value;
    if (reduced) return { opacity: 1 - t };
    const lift = 1 + Math.sin(t * Math.PI) * LIFT;
    return {
      opacity: 1,
      transform: [{ perspective: PERSPECTIVE }, { rotateY: `${t * 180}deg` }, { scale: lift }],
    };
  });
  const faceStyle = useAnimatedStyle(() => {
    const t = turned.value;
    if (reduced) return { opacity: t };
    const lift = 1 + Math.sin(t * Math.PI) * LIFT;
    return {
      opacity: 1,
      transform: [
        { perspective: PERSPECTIVE },
        { rotateY: `${180 + t * 180}deg` },
        { scale: lift },
      ],
    };
  });

  const turn = () => {
    cue('tick');
    onTurn();
  };

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      onPress={turn}
      style={[styles.card, { width, height: width * CARD_RATIO }]}
      testID="playing-card"
    >
      <Animated.View style={[styles.side, backStyle]} testID="playing-card-back">
        <Back width={width} />
      </Animated.View>
      <Animated.View style={[styles.side, faceStyle]} testID="playing-card-face">
        <Face card={card} number={number} width={width} />
      </Animated.View>
    </Pressable>
  );
}

const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  card: { alignSelf: 'center' },
  side: { ...fill, backfaceVisibility: 'hidden' },
  face: {
    flex: 1,
    borderRadius: RADIUS,
    overflow: 'hidden',
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: 'rgba(232,204,160,0.7)',
  },
  paper: { borderColor: 'rgba(184,149,90,0.75)' },
  overlay: { position: 'absolute', top: 0, left: 0 },
  inner: {
    position: 'absolute',
    top: INSET,
    left: INSET,
    right: INSET,
    bottom: INSET,
    borderRadius: RADIUS - INSET / 2,
    borderWidth: 0.75,
    borderColor: GOLD,
    opacity: 0.55,
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
  field: {
    position: 'absolute',
    top: INSET,
    left: INSET,
    right: INSET,
    bottom: INSET,
    borderRadius: RADIUS - INSET / 2,
    overflow: 'hidden',
  },
  emblem: { ...fill, alignItems: 'center', justifyContent: 'center' },
  markRow: { position: 'absolute', left: 0, right: 0, bottom: 34, alignItems: 'center' },
  mark: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 5,
    color: GOLD,
    opacity: 0.85,
  },
});
