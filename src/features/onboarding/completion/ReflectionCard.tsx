import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import type { ReflectionCardState } from './cardState';
import { LIGHT_SANS, LIGHT_SERIF } from './fonts';
import { ReadBack } from './ReadBack';
import { Seal } from './Seal';
import { SealedLock } from './SealedLock';
import { bindLastWords, completionText } from './text';

// Measured from the golden, which draws the card with a tighter corner than the spec's 22 pt radius
// and in tighter bands than its 24 pt padding. The golden wins (docs/SPEC_CONFLICTS.md).
const RADIUS = 14;
const SEAL_INSET = 25.3;
const BODY_INSET = 33;
const BAND = {
  top: 18.4,
  header: 24,
  toBody: 12.85,
  afterBody: 8.9,
  afterRule: 11.1,
  footer: 20,
  bottom: 13.9,
};
const TITLE_GAP = 18;
const BODY = { fontFamily: LIGHT_SANS, fontSize: 14.1, lineHeight: 18.75, opacity: 0.78 } as const;
const SAVED = { fontFamily: LIGHT_SANS, fontSize: 10.9, lineHeight: 14, opacity: 0.7 } as const;
// The golden's glass is a lighter, warmer frost than the glass token, which would leave this card
// the darkest thing on the screen. A faint warm lift over regular glass closes the gap. Strong glass,
// used at large text, stays as dark as the token for legibility.
const GLASS_LIFT = { night: 'rgba(250,196,100,0.12)', day: 'rgba(240,215,170,0.13)' } as const;
const RULE_HEIGHT = 0.6;
const RULE_OPACITY = 0.3;
const LOCK_SIZE = 16;
const ACTION_GAP = 28;
// The lock closes, and the line beside it comes up, a beat after the mark is made.
const LOCK_AFTER = 900;
const SAVED_AFTER = 940;
const SAVED_MS = 320;
/**
 * Read it back, in the card's foot beside the saved line (D-017): a little larger and brighter than
 * that line, so that it reads as something to touch, and no louder. Its touch reaches 44 pt, though
 * the foot is 20 pt tall.
 */
const FOOT_ACTION = {
  fontFamily: 'Inter_400Regular',
  fontSize: 11.5,
  lineHeight: 14,
  letterSpacing: 0.4,
} as const;
const FOOT_REACH = { top: 15, bottom: 15, left: 12, right: 12 };
/**
 * What the words keep of the card's room besides themselves: the space above them, and a line for
 * the note while they are being set out, so that the card never outgrows its place for it.
 */
const WORDS_EXTRA = 28;
/** The words never get less than this before they scroll, however small the screen. */
const LEAST_WORDS = 120;
/** Before the card knows its room: about a third of the screen. */
const ROOM_GUESS = 0.32;

/**
 * Fades its content in over 180 ms, or over `ms` after `delay`. Reduce Motion makes this instant
 * through the system setting.
 */
function Reveal({
  visible = true,
  ms = tokens.motion.fast,
  delay = 0,
  children,
}: {
  visible?: boolean;
  ms?: number;
  delay?: number;
  children: ReactNode;
}) {
  const shown = useSharedValue(0);
  useEffect(() => {
    const fade = withTiming(visible ? 1 : 0, {
      duration: ms,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    });
    shown.set(visible && delay > 0 ? withDelay(delay, fade) : fade);
  }, [delay, ms, shown, visible]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={styles.action}
    >
      <EchoText variant="label" style={styles.actionText}>
        {label}
      </EchoText>
    </Pressable>
  );
}

/** Read it back, and Close once it is open. */
function FootAction({ open, onPress }: { open: boolean; onPress: () => void }) {
  const label = open ? completionText.close : completionText.readItBack;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      hitSlop={FOOT_REACH}
      style={({ pressed }) => [styles.footAction, pressed && styles.pressed]}
    >
      <EchoText variant="bodyM" style={FOOT_ACTION} maxFontSizeMultiplier={1.4}>
        {label}
      </EchoText>
    </Pressable>
  );
}

type Props = {
  state: ReflectionCardState;
  /** The reflection, shown only in the success state. */
  text?: string;
  /** The saved card offers the reading agreement, its one quiet action (D-017). */
  ask?: boolean;
  /** “Saved privately · 7 minutes”, with the real time. Hidden until the entry has been read. */
  saved: string;
  savedVisible: boolean;
  onRetry: () => void;
  onContinue: () => void;
  /** Hear it back: opens the reading agreement. */
  onAsk?: () => void;
  /** Talk to someone, in place of a reflection: opens the support sheet. */
  onSupport?: () => void;
  /** The entry just kept, when it has words to read back. Read it back opens them in the card. */
  entryId?: string | null;
  /**
   * How tall the card may grow before the screen would scroll, or null where the whole page scrolls
   * already (large text, landscape). Unknown, it is 0, and a share of the screen is used.
   */
  room?: number | null;
  /** When the mark begins to be made, from mount (see Seal). */
  startAt?: number;
};

/**
 * Today's echo. Offline is a first-class state, not a failure: with no reflection provider it is
 * the private saved-entry card, and it is complete as it stands. Without a reading agreement that
 * card offers it, quietly. Support is never a reflection: a gentle line and a way to someone. And the
 * entry just kept can be read back, set out, inside the card, under its echo.
 */
export function ReflectionCard({
  state,
  text,
  ask = false,
  saved,
  savedVisible,
  onRetry,
  onContinue,
  onAsk,
  onSupport,
  entryId = null,
  room = 0,
  startAt = tokens.motion.standard,
}: Props) {
  const { colors, name } = useTheme();
  const { accessibleLayout } = useLayout();
  const { height: screenHeight } = useWindowDimensions();
  const [reading, setReading] = useState(false);
  // The parts of the card above and below the words, as laid out: the words get what is left.
  const [above, setAbove] = useState(0);
  const [below, setBelow] = useState(0);

  const body =
    state === 'loading'
      ? completionText.pending
      : state === 'error'
        ? completionText.error
        : state === 'support'
          ? completionText.support
          : text;
  const asking = !body && ask && onAsk !== undefined;
  const wordsRoom =
    room === null
      ? null
      : Math.max(
          LEAST_WORDS,
          room > 0
            ? room - (BAND.top + BAND.bottom + above + below + WORDS_EXTRA)
            : Math.round(screenHeight * ROOM_GUESS),
        );

  return (
    <GlassCard strength={accessibleLayout ? 'strong' : 'regular'} radius={RADIUS}>
      {!accessibleLayout && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_LIFT[name] }]}
        />
      )}
      <View style={styles.content}>
        <View onLayout={(event) => setAbove(event.nativeEvent.layout.height)}>
          <View style={styles.header}>
            <Seal listening={state === 'loading'} startAt={startAt} />
            <View style={[styles.divider, { backgroundColor: colors.textPrimary }]} />
            <EchoText variant="bodyL" serif accessibilityRole="header" style={styles.title}>
              {copy.completion.cardTitle}
            </EchoText>
          </View>

          {body ? (
            <Reveal key={state}>
              <EchoText
                variant="bodyM"
                style={[styles.body, BODY]}
                accessibilityLabel={body}
                accessibilityLiveRegion="polite"
                accessibilityState={{ busy: state === 'loading' }}
              >
                {bindLastWords(body)}
              </EchoText>
              {state === 'error' && (
                <View style={styles.actions}>
                  <TextAction label={completionText.retry} onPress={onRetry} />
                  <TextAction label={completionText.continue} onPress={onContinue} />
                </View>
              )}
              {state === 'support' && onSupport && (
                <View style={styles.actions}>
                  <TextAction label={completionText.talkToSomeone} onPress={onSupport} />
                </View>
              )}
            </Reveal>
          ) : asking ? (
            <Reveal key="ask">
              <View style={styles.ask}>
                <TextAction label={completionText.hearItBack} onPress={() => onAsk?.()} />
              </View>
            </Reveal>
          ) : null}
        </View>

        {entryId ? <ReadBack entryId={entryId} open={reading} room={wordsRoom} /> : null}

        <View onLayout={(event) => setBelow(event.nativeEvent.layout.height)}>
          <View
            style={[
              styles.rule,
              {
                backgroundColor: colors.textPrimary,
                marginTop: body ? BAND.afterBody : asking ? 0 : BAND.toBody,
              },
            ]}
          />
          <Reveal visible={savedVisible} ms={SAVED_MS} delay={startAt + SAVED_AFTER}>
            <View style={[styles.footer, accessibleLayout && styles.footerLoose]}>
              <SealedLock
                size={LOCK_SIZE}
                color={colors.textSecondary}
                startAt={startAt + LOCK_AFTER}
              />
              <EchoText variant="bodyM" color="textSecondary" style={[SAVED, styles.saved]}>
                {saved}
              </EchoText>
              {entryId ? (
                <FootAction open={reading} onPress={() => setReading((open) => !open)} />
              ) : null}
            </View>
          </Reveal>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: BAND.top, paddingBottom: BAND.bottom },
  header: {
    height: BAND.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SEAL_INSET,
    gap: TITLE_GAP,
  },
  divider: { width: 1, height: BAND.header, opacity: 0.32 },
  title: { flex: 1, fontFamily: LIGHT_SERIF, fontSize: 18.4 },
  body: { marginTop: BAND.toBody, paddingHorizontal: BODY_INSET },
  actions: {
    marginTop: 4,
    paddingHorizontal: BODY_INSET,
    flexDirection: 'row',
    gap: ACTION_GAP,
  },
  // The one action sits where the reflection's first line would, its words at the body's inset.
  ask: { paddingHorizontal: BODY_INSET, flexDirection: 'row' },
  action: { minHeight: tokens.size.tapTarget, justifyContent: 'center' },
  actionText: { letterSpacing: 1.6 },
  rule: {
    height: RULE_HEIGHT,
    marginHorizontal: BODY_INSET,
    opacity: RULE_OPACITY,
  },
  footer: {
    height: BAND.footer,
    marginTop: BAND.afterRule,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BODY_INSET - 2,
    gap: 8,
  },
  // At large text the foot grows with its words, and Read it back goes under the saved line if it must.
  footerLoose: { height: undefined, minHeight: BAND.footer, flexWrap: 'wrap', rowGap: 6 },
  saved: { flexShrink: 1 },
  footAction: { marginLeft: 'auto', paddingLeft: tokens.space[8] },
  pressed: { opacity: 0.6 },
});
