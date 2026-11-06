import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OnboardingHeader } from '@/components/OnboardingHeader';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { backPath, nextPath } from '@/features/onboarding/flow';
import { PrivacyControls } from '@/features/onboarding/privacy/PrivacyControls';

const STEP = 5;
const LIST_TOP = 28;
const CTA_GAP = 22;
// This golden sets its title larger than the other steps' 35 pt, with the same 1.125 line height.
const TITLE = { fontSize: 43.3, lineHeight: 48.7 };

/**
 * The one place this step finishes. Cloud backup has no backend yet and its provider is undecided,
 * so nothing is sent and no sign-in is asked for. When backup lands, the authentication step
 * (anonymous + backup on, see INTERACTIONS_AND_STATES.md) goes here, before navigating onward.
 */
function finishPrivacy(next: string | undefined) {
  if (next) router.navigate(next as never);
}

export function PrivacyScreen() {
  const { accessibleLayout, landscape } = useLayout();
  const back = backPath('privacy');
  const next = nextPath('privacy');
  // Large text and landscape scroll, so the switches join the heading instead of pinning to the foot.
  const stacked = accessibleLayout || landscape;

  return (
    <ScreenShell
      screen="privacy"
      header={
        <OnboardingHeader
          step={STEP}
          onBack={back ? () => router.navigate(back as never) : undefined}
        />
      }
      footer={
        <View style={styles.footer}>
          {!stacked && <PrivacyControls />}
          <PrimaryCTA label={copy.privacy.cta} onPress={() => finishPrivacy(next)} />
        </View>
      }
    >
      <OnboardingHeading
        title={copy.privacy.title}
        subtitle={copy.privacy.subtitle}
        titleStyle={TITLE}
      />
      {stacked && (
        <View style={styles.list}>
          <PrivacyControls />
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: { gap: CTA_GAP },
  list: { marginTop: LIST_TOP },
});
