import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { EchoWordmark } from '@/components/EchoWordmark';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { nextPath } from '@/features/onboarding/flow';

const GOLDEN_CTA_WIDTH = 316; // docs/SPEC_CONFLICTS.md, C-04
const HERO_TOP = 54;

/** Reference screen for agents: copy from src/content, tokens through shared components. */
export function LandingScreen() {
  const { compact } = useLayout();
  return (
    <ScreenShell
      screen="landing"
      footer={
        <View style={styles.footer}>
          <PrimaryCTA
            variant="glass"
            label={copy.landing.cta}
            width={GOLDEN_CTA_WIDTH}
            tracking={5.5}
            onPress={() => router.navigate(nextPath('landing') as never)}
          />
          <EchoText variant="caption" align="center" color="textSecondary" style={styles.caption}>
            {copy.landing.caption}
          </EchoText>
        </View>
      }
    >
      <View style={[styles.hero, { marginTop: compact ? HERO_TOP - 16 : HERO_TOP }]}>
        <EchoWordmark hero />
        <EchoText variant="bodyL" serif italic align="center" style={styles.tagline}>
          {copy.landing.tagline}
        </EchoText>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center' },
  tagline: { marginTop: 10 },
  footer: { gap: 18 },
  caption: { fontSize: 10.5, lineHeight: 14, letterSpacing: 2.4, opacity: 0.8 },
});
