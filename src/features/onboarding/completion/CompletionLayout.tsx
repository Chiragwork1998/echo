import { ScrollView, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { onboardingSteps } from '@/features/onboarding/flow';

import type { CardView } from './cardState';
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
};

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
}: Props) {
  const { accessibleLayout, landscape } = useLayout();
  const card = (
    <ReflectionCard
      state={view.state}
      text={view.text}
      saved={saved}
      savedVisible={savedVisible}
      onRetry={onRetry}
      onContinue={onEnter}
    />
  );

  return (
    <ScreenShell
      screen="completion"
      header={<CompletionHeader step={mode === 'onboarding' ? STEP : undefined} />}
      footer={
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
        </View>
      }
    >
      <CompletionHeading title={copy.completion.title} subtitle={copy.completion.subtitle} />
      {accessibleLayout || landscape ? (
        // The shell scrolls the whole screen here, so the card simply follows the heading.
        <View style={styles.flowing}>{card}</View>
      ) : (
        // Bottom-anchored as in the golden. A long reflection scrolls rather than reach the heading.
        <ScrollView
          style={styles.slot}
          contentContainerStyle={styles.slotContent}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
        >
          {card}
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, marginTop: CARD_BELOW_HEADING },
  slotContent: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: CARD_ABOVE_CTA },
  flowing: { marginTop: CARD_BELOW_HEADING, marginBottom: CARD_ABOVE_CTA },
  footer: { gap: ERROR_GAP },
  failed: { fontSize: 13, lineHeight: 18, ...SHADOW },
});
