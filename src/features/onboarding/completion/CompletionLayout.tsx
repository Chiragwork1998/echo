import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { tokens } from '@/design/tokens';
import { onboardingSteps } from '@/features/onboarding/flow';

import type { CardView } from './cardState';
import { CardArrival } from './CardArrival';
import { CompletionHeader } from './CompletionHeader';
import { CompletionHeading } from './CompletionHeading';
import { ReflectionCard } from './ReflectionCard';
import { completionText } from './text';

const STEP = onboardingSteps.indexOf('completion') + 1;
// The golden's card ends 35 pt above its CTA. The shell's CTA is taller and sits higher, so this keeps
// the card where the golden has it (the shell already leaves 12 pt above the CTA).
const CARD_ABOVE_CTA = 17;
const CARD_BELOW_HEADING = 28;
const ERROR_GAP = 12;
// The card's mark is made a beat after the screen has begun to settle. Onboarding arrives over a plate
// that dissolves for 650 ms, so it waits that much longer.
const MARK_AFTER = {
  onboarding: tokens.motion.standard + 300,
  daily: tokens.motion.standard,
} as const;
// This sits on the photograph, not on glass.
const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.7)',
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
} as const;

type Props = {
  /** onboarding: step 8 of the flow. daily: the same composition after a daily session. */
  mode: 'onboarding' | 'daily';
  view: CardView;
  /** “Saved privately · 7 minutes”, with the real time. */
  saved: string;
  savedVisible: boolean;
  entering: boolean;
  /** Entering could not be completed. The words are still saved. */
  failed: boolean;
  onEnter: () => void;
  onRetry: () => void;
  /** Hear it back, on the saved card: opens the reading agreement. */
  onAsk?: () => void;
  /** Talk to someone, in place of a reflection. */
  onSupport?: () => void;
  /** The entry just kept, when it has words that Read it back can open. */
  entryId?: string | null;
  /**
   * How far the interface has gone, 0 to 1, over the photograph, which stays: onboarding lets its words,
   * card and button go before it hands over to Home. Without it the interface is simply there.
   */
  leaving?: SharedValue<number>;
};

/** A part of the interface, as much of it as has not gone. */
function Going({
  gone,
  style,
  children,
}: PropsWithChildren<{ gone: SharedValue<number>; style?: StyleProp<ViewStyle> }>) {
  const fade = useAnimatedStyle(() => ({ opacity: 1 - gone.get() }));
  return (
    <Animated.View testID="completion-going" pointerEvents="box-none" style={[style, fade]}>
      {children}
    </Animated.View>
  );
}

/** The one composition, drawn the same for onboarding and for a daily session. */
export function CompletionLayout({
  mode,
  view,
  saved,
  savedVisible,
  entering,
  failed,
  onEnter,
  onRetry,
  onAsk,
  onSupport,
  entryId = null,
  leaving,
}: Props) {
  const { accessibleLayout, landscape } = useLayout();
  const flowing = accessibleLayout || landscape;
  // The height of the card's slot, less the space it keeps above the CTA: what the card may grow to
  // when the entry is read back in it, before the slot would have to scroll.
  const [room, setRoom] = useState(0);
  // Each part goes as one with the others; the photograph, which the shell draws, is not among them.
  const part = (node: ReactNode, style?: StyleProp<ViewStyle>) =>
    leaving ? (
      <Going gone={leaving} style={style}>
        {node}
      </Going>
    ) : (
      node
    );
  const card = (
    <CardArrival>
      <ReflectionCard
        state={view.state}
        text={view.text}
        ask={view.ask}
        saved={saved}
        savedVisible={savedVisible}
        onRetry={onRetry}
        onContinue={onEnter}
        onAsk={onAsk}
        onSupport={onSupport}
        entryId={entryId}
        room={flowing ? null : room}
        startAt={MARK_AFTER[mode]}
      />
    </CardArrival>
  );

  const content = (
    <>
      <CompletionHeading title={copy.completion.title} subtitle={copy.completion.subtitle} />
      {flowing ? (
        // The shell scrolls the whole screen here, so the card simply follows the heading.
        <View style={styles.flowing}>{card}</View>
      ) : (
        // Bottom-anchored as in the golden. A long reflection scrolls rather than reach the heading.
        <ScrollView
          style={styles.slot}
          contentContainerStyle={styles.slotContent}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          onLayout={(event) =>
            setRoom(Math.max(0, event.nativeEvent.layout.height - CARD_ABOVE_CTA))
          }
        >
          {card}
        </ScrollView>
      )}
    </>
  );

  return (
    <ScreenShell
      screen="completion"
      header={part(<CompletionHeader step={mode === 'onboarding' ? STEP : undefined} />)}
      footer={part(
        <View style={styles.footer}>
          {failed && (
            <EchoText
              variant="bodyM"
              color="textSecondary"
              align="center"
              accessibilityRole="alert"
              style={styles.failed}
            >
              {completionText.enterFailed}
            </EchoText>
          )}
          <PrimaryCTA label={copy.completion.cta} arrow loading={entering} onPress={onEnter} />
        </View>,
      )}
    >
      {/* Filling the shell's content as the content itself did, so that nothing moves. */}
      {part(content, styles.content)}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  slot: { flex: 1, marginTop: CARD_BELOW_HEADING },
  slotContent: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: CARD_ABOVE_CTA },
  flowing: { marginTop: CARD_BELOW_HEADING, marginBottom: CARD_ABOVE_CTA },
  footer: { gap: ERROR_GAP },
  failed: { fontSize: 13, lineHeight: 18, ...SHADOW },
});
