import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { breatheCopy } from '@/features/breathe/breatheCopy';
import { dateLabel } from '@/features/echoes/entryFacts';
import { keepTogether } from '@/features/tab-pages/keepTogether';
import { Rule, Surface, TextAction } from '@/features/tab-pages/parts';
import { Reveal } from '@/features/tab-pages/Reveal';
import {
  detail,
  prose,
  question,
  quoted,
  runIn,
  supporting,
} from '@/features/tab-pages/textStyles';
import type { PatternCard } from '@/services/patterns';

import { PlayingCard } from './cards/PlayingCard';
import { patternsCopy } from './patternsCopy';

const { cards: words } = patternsCopy;

const PAGE = tokens.space[24];
/** The reading of a card just turned waits for the turn to pass its middle. */
const TURN_SETTLE_MS = 420;
/** Where an opening quotation mark hangs, so the quoted words line up with the prose. */
const HANG = 9;
// A reading of the person's own words wears the faint warmth Completion's reflection card has.
const WARMTH = { night: 'rgba(250,196,100,0.05)', day: 'rgba(240,215,170,0.07)' } as const;

/** A playing card held at a comfortable size: never wider than this, on any phone. */
const CARD_MAX = 340;

/** A part of the card, spoken as one piece: its name, then its words. */
function Part({ spoken, children }: PropsWithChildren<{ spoken: string }>) {
  return (
    <View style={styles.part} accessible accessibilityLabel={spoken}>
      {children}
    </View>
  );
}

/** A card's practice is about breath, so it can lead to Breathe. */
export const aboutBreath = (practice: string) => /\bbreath/i.test(practice);

type Props = {
  card: PatternCard;
  index: number;
  total: number;
  /** Opens the report sheet. Without it, the card offers no report. */
  onReport?: () => void;
  /** This card was reported in this sitting, so it says so instead of offering it again. */
  reported?: boolean;
  /**
   * Made by a reading in this sitting: it arrives face down, and its reading shows once the person
   * turns it over. Cards already seen arrive face up.
   */
  fresh?: boolean;
};

/**
 * One pattern, set as a page: its name in Cormorant, what recurs as plain prose, the person's own
 * words set as quotations with their days, a way of seeing it with its credit, a practice, and a
 * question to sit with. No ornament: the type carries it. It is still. Nothing tilts or shimmers.
 */
export function PatternCardView({
  card,
  index,
  total,
  onReport,
  reported = false,
  fresh = false,
}: Props) {
  const { name, colors } = useTheme();
  const { width, gutter } = useLayout();
  const credit = words.ideaFrom(card.lens.source);
  // Turned over once, a card stays read; turning it again only shows its back for a moment's look.
  const [revealed, setRevealed] = useState(!fresh);
  const [showingBack, setShowingBack] = useState(false);
  const faceUp = revealed && !showingBack;
  const turn = () => {
    if (!revealed) setRevealed(true);
    else setShowingBack((back) => !back);
  };
  const label = words.cardLabel(card.name, index, total);
  const reading = (
    <Surface strength="strong" radius={tokens.radius.card} tint={WARMTH[name]}>
      <View style={styles.page}>
        <EchoText variant="bodyM" style={[prose, styles.noticed]} maxFontSizeMultiplier={1.6}>
          {keepTogether(card.noticed)}
        </EchoText>

        <Part
          spoken={`${words.inYourWords}. ${card.evidence
            .map((item) => `${item.quote}, ${dateLabel(item.date)}`)
            .join('. ')}`}
        >
          <View style={styles.quotes}>
            {card.evidence.map((item) => (
              <View key={`${item.date}-${item.quote}`} style={styles.quote}>
                <View>
                  <EchoText
                    variant="bodyL"
                    style={[quoted, styles.mark]}
                    maxFontSizeMultiplier={1.6}
                  >
                    {'“'}
                  </EchoText>
                  <EchoText variant="bodyL" style={quoted} maxFontSizeMultiplier={1.6}>
                    {`${keepTogether(item.quote)}”`}
                  </EchoText>
                </View>
                <EchoText
                  variant="caption"
                  color="textSecondary"
                  style={supporting}
                  maxFontSizeMultiplier={1.6}
                >
                  {dateLabel(item.date)}
                </EchoText>
              </View>
            ))}
          </View>
        </Part>

        <Part spoken={`${words.aWayToSeeIt}. ${card.lens.text} ${credit}`}>
          <EchoText variant="bodyM" style={prose} maxFontSizeMultiplier={1.6}>
            {keepTogether(card.lens.text)}
          </EchoText>
          <EchoText
            variant="caption"
            color="textSecondary"
            style={supporting}
            maxFontSizeMultiplier={1.6}
          >
            {credit}
          </EchoText>
        </Part>

        {/* The practice is one block, so a way into it (Breathe) can sit at its end. */}
        <View style={styles.part}>
          <View accessible accessibilityLabel={`${words.tryThis}. ${card.practice}`}>
            <EchoText variant="bodyM" style={prose} maxFontSizeMultiplier={1.6}>
              <Text style={runIn}>{`${words.tryThis}. `}</Text>
              {keepTogether(card.practice)}
            </EchoText>
          </View>
          {aboutBreath(card.practice) && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={breatheCopy.cardLink}
              onPress={() => router.navigate('/home/breathe' as never)}
              hitSlop={10}
              style={({ pressed }) => [styles.breathe, pressed && styles.pressed]}
              testID="pattern-card-breathe"
            >
              <EchoText
                variant="bodyM"
                style={[detail, styles.breatheText, { color: colors.accentWarm }]}
              >
                {breatheCopy.cardLink}
              </EchoText>
            </Pressable>
          )}
        </View>

        <Rule inset={0} />

        <View accessible accessibilityLabel={`${words.askYourself}. ${card.question}`}>
          <EchoText variant="bodyL" style={question} maxFontSizeMultiplier={1.5}>
            {keepTogether(card.question)}
          </EchoText>
        </View>

        <View style={styles.foot}>
          <EchoText
            variant="caption"
            color="textSecondary"
            style={supporting}
            maxFontSizeMultiplier={1.6}
          >
            {words.reflectionNote}
          </EchoText>
          {onReport && !reported ? (
            <TextAction
              label={patternsCopy.report.action}
              spoken={patternsCopy.report.actionSpoken(card.name)}
              onPress={onReport}
              tone="textSecondary"
              style={styles.report}
            />
          ) : null}
          {reported ? (
            <View style={styles.reported}>
              <EchoText
                variant="caption"
                color="textSecondary"
                style={supporting}
                accessibilityLiveRegion="polite"
              >
                {patternsCopy.report.reported}
              </EchoText>
            </View>
          ) : null}
        </View>
      </View>
    </Surface>
  );
  return (
    <Reveal>
      <View style={styles.stack}>
        <PlayingCard
          card={card}
          number={index}
          faceUp={faceUp}
          onTurn={turn}
          width={Math.min(width - gutter * 2, CARD_MAX)}
          spoken={faceUp ? label : words.faceDown(index, total)}
          role={faceUp ? 'header' : 'button'}
          hint={words.turnOver}
        />
        {revealed ? (
          // A card turned over here lets its reading rise in after it; one already seen just shows it.
          fresh ? (
            <Reveal delay={TURN_SETTLE_MS}>{reading}</Reveal>
          ) : (
            reading
          )
        ) : (
          <EchoText
            variant="bodyM"
            color="textSecondary"
            style={[detail, styles.hint]}
            maxFontSizeMultiplier={1.6}
          >
            {words.turnHint}
          </EchoText>
        )}
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  stack: { gap: tokens.space[20] },
  hint: { textAlign: 'center' },
  page: {
    gap: tokens.space[24],
    paddingHorizontal: PAGE,
    paddingTop: tokens.space[32],
    paddingBottom: tokens.space[12],
  },
  noticed: { marginTop: -tokens.space[8] },
  part: { gap: tokens.space[8] },
  quotes: { gap: tokens.space[16], paddingLeft: HANG },
  quote: { gap: tokens.space[4] },
  mark: { position: 'absolute', left: -HANG, top: 0 },
  breathe: { alignSelf: 'flex-start', minHeight: tokens.size.tapTarget, justifyContent: 'center' },
  breatheText: { textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
  foot: { gap: 0 },
  report: { marginTop: tokens.space[4] },
  reported: { minHeight: tokens.size.tapTarget, justifyContent: 'center' },
});
