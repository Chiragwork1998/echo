import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { TrackedText } from '@/components/TrackedText';
import { tokens } from '@/design/tokens';
import { breatheCopy } from '@/features/breathe/breatheCopy';
import { dateLabel } from '@/features/echoes/entryFacts';
import type { PatternCard } from '@/services/patterns';

import { Constellation } from './Constellation';
import { patternsCopy } from './patternsCopy';

// A keepsake, so it is midnight in Day as well as Night, like a card held in the hand.
const MIDNIGHT = tokens.color.night;
const GOLD = MIDNIGHT.accentWarm;
const FACE = ['#102848', '#091a31', '#050e1d'] as const;
const GOLD_EDGE = 'rgba(232,204,160,0.34)';
const GOLD_FRAME = 'rgba(232,204,160,0.14)';
const GOLD_RULE = 'rgba(232,204,160,0.30)';

const RADIUS = 28;
const FRAME_INSET = 8;
const PAD = 26;
const SKY_HEIGHT = 168;
const REVEAL_MS = 560;
const REVEAL_RISE = 10;

const ink = { color: MIDNIGHT.textPrimary } as const;
const soft = { color: MIDNIGHT.textSecondary } as const;
const gold = { color: GOLD } as const;

/** One gentle rise and fade as a card arrives. Under Reduce Motion it is simply there. */
function Reveal({ children }: PropsWithChildren) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(1, { duration: REVEAL_MS, reduceMotion: ReduceMotion.System }));
  }, [shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * REVEAL_RISE }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function Rule({ short }: { short?: boolean }) {
  return <View style={[styles.rule, short && styles.ruleShort]} />;
}

/** A labelled part of the card, spoken as one piece: its heading, then its words. */
function Part({
  heading,
  spoken,
  children,
}: PropsWithChildren<{ heading: string; spoken: string }>) {
  return (
    <View style={styles.part} accessible accessibilityLabel={`${heading}. ${spoken}`}>
      <EchoText variant="caption" style={[styles.heading, gold]} accessibilityElementsHidden>
        {heading.toUpperCase()}
      </EchoText>
      {children}
    </View>
  );
}

type Props = { card: PatternCard; index: number; total: number };

/** A card's practice is about breath, so it can lead to Breathe. */
export const aboutBreath = (practice: string) => /\bbreath/i.test(practice);

/**
 * One pattern, set as an object worth keeping: midnight glass, its own faint constellation, a serif
 * name, a hairline, and "The Pattern". It is still. Nothing tilts, shimmers or plays.
 */
export function PatternCardView({ card, index, total }: Props) {
  return (
    <Reveal>
      <View style={styles.shadow}>
        <LinearGradient colors={FACE} style={styles.face}>
          <View style={styles.sky}>
            <Constellation name={card.name} color={GOLD} />
          </View>
          <View style={styles.frame} pointerEvents="none" />

          <View
            style={styles.strip}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <TrackedText
              text={patternsCopy.cards.brand}
              tracking={3}
              variant="caption"
              style={gold}
            />
            <EchoText variant="caption" style={[styles.count, soft]}>
              {patternsCopy.cards.cardOf(index, total)}
            </EchoText>
          </View>

          <View style={styles.body}>
            <EchoText
              variant="displayM"
              align="center"
              accessibilityRole="header"
              accessibilityLabel={patternsCopy.cards.cardLabel(card.name, index, total)}
              maxFontSizeMultiplier={1.5}
              style={[styles.name, ink]}
            >
              {card.name}
            </EchoText>
            <View style={styles.center}>
              <Rule short />
            </View>
            <View
              style={styles.center}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <TrackedText
                text={patternsCopy.cards.eyebrow.toUpperCase()}
                tracking={3.4}
                variant="caption"
                style={gold}
              />
            </View>
            <EchoText
              variant="bodyM"
              align="center"
              maxFontSizeMultiplier={1.6}
              style={[styles.noticed, soft]}
            >
              {card.noticed}
            </EchoText>

            <Rule />

            <Part
              heading={patternsCopy.cards.inYourWords}
              spoken={card.evidence
                .map((item) => `${item.quote}, ${dateLabel(item.date)}`)
                .join('. ')}
            >
              {card.evidence.map((item) => (
                <View key={`${item.date}-${item.quote}`} style={styles.quoteRow}>
                  <View style={styles.quoteBar} />
                  <View style={styles.quoteText}>
                    <EchoText
                      variant="bodyL"
                      serif
                      italic
                      maxFontSizeMultiplier={1.6}
                      style={[styles.quote, ink]}
                    >
                      {item.quote}
                    </EchoText>
                    <EchoText
                      variant="caption"
                      maxFontSizeMultiplier={1.6}
                      style={[styles.date, soft]}
                    >
                      {dateLabel(item.date)}
                    </EchoText>
                  </View>
                </View>
              ))}
            </Part>

            <Part
              heading={patternsCopy.cards.aWayToSeeIt}
              spoken={`${card.lens.text} ${patternsCopy.cards.ideaFrom(card.lens.source)}`}
            >
              <EchoText variant="bodyM" maxFontSizeMultiplier={1.6} style={[styles.paragraph, ink]}>
                {card.lens.text}
              </EchoText>
              <EchoText variant="caption" maxFontSizeMultiplier={1.6} style={[styles.source, soft]}>
                {patternsCopy.cards.ideaFrom(card.lens.source)}
              </EchoText>
            </Part>

            <Part heading={patternsCopy.cards.tryThis} spoken={card.practice}>
              <EchoText variant="bodyM" maxFontSizeMultiplier={1.6} style={[styles.paragraph, ink]}>
                {card.practice}
              </EchoText>
            </Part>
            {aboutBreath(card.practice) && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={breatheCopy.cardLink}
                onPress={() => router.navigate('/home/breathe' as never)}
                hitSlop={10}
                style={styles.breathe}
                testID="pattern-card-breathe"
              >
                <EchoText variant="caption" style={[styles.breatheText, gold]}>
                  {breatheCopy.cardLink}
                </EchoText>
              </Pressable>
            )}

            <Rule />

            <View
              accessible
              accessibilityLabel={`${patternsCopy.cards.askYourself}. ${card.question}`}
            >
              <EchoText
                variant="caption"
                style={[styles.heading, styles.askHeading, gold]}
                accessibilityElementsHidden
              >
                {patternsCopy.cards.askYourself.toUpperCase()}
              </EchoText>
              <EchoText
                variant="bodyL"
                serif
                maxFontSizeMultiplier={1.6}
                style={[styles.question, ink]}
              >
                {card.question}
              </EchoText>
            </View>

            <EchoText
              variant="caption"
              align="center"
              maxFontSizeMultiplier={1.6}
              style={[styles.note, soft]}
            >
              {patternsCopy.cards.reflectionNote}
            </EchoText>
          </View>
        </LinearGradient>
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: RADIUS, boxShadow: '0 22px 48px rgba(0,0,0,0.42)' },
  face: {
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: GOLD_EDGE,
    overflow: 'hidden',
  },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, height: SKY_HEIGHT },
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: FRAME_INSET,
    borderRadius: RADIUS - FRAME_INSET,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GOLD_FRAME,
  },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: PAD,
    paddingTop: 22,
  },
  count: { opacity: 0.8, letterSpacing: 1.2 },
  body: { paddingHorizontal: PAD, paddingTop: 52, paddingBottom: 24, gap: tokens.space[16] },
  name: { fontSize: 36, lineHeight: 40, letterSpacing: -0.2 },
  center: { alignItems: 'center' },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: GOLD_RULE, marginVertical: 4 },
  ruleShort: { width: 56, alignSelf: 'center' },
  noticed: { lineHeight: 25, opacity: 0.96 },
  part: { gap: tokens.space[8] },
  heading: { letterSpacing: 1.6, opacity: 0.92 },
  askHeading: { marginBottom: tokens.space[8] },
  quoteRow: { flexDirection: 'row', gap: tokens.space[12] },
  quoteBar: { width: 2, borderRadius: 1, backgroundColor: GOLD_RULE },
  quoteText: { flex: 1, gap: 2 },
  quote: { fontSize: 21, lineHeight: 28 },
  date: { fontSize: 12.5, letterSpacing: 0.2, opacity: 0.78 },
  paragraph: { lineHeight: 24 },
  breathe: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center', marginTop: -6 },
  breatheText: { fontSize: 13, letterSpacing: 0.6, textDecorationLine: 'underline' },
  source: { fontSize: 12.5, lineHeight: 17, letterSpacing: 0.1, opacity: 0.78 },
  question: { fontSize: 23, lineHeight: 31 },
  note: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.1,
    opacity: 0.6,
    marginTop: tokens.space[8],
  },
});
