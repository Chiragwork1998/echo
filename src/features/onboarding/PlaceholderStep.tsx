import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';

import { backPath, nextPath, onboardingSteps, type ScreenId } from './flow';

/** Keeps the flow walkable until the screen's owner replaces it. Copy comes from src/content. */
export function PlaceholderStep(props: { screen: ScreenId; title: string; cta: string }) {
  const { screen, title, cta } = props;
  const back = backPath(screen);
  const next = nextPath(screen);
  return (
    <ScreenShell
      screen={screen}
      header={
        <OnboardingHeader
          step={onboardingSteps.indexOf(screen) + 1}
          onBack={back ? () => router.dismissTo(back as never) : undefined}
        />
      }
      footer={<PrimaryCTA label={cta} onPress={() => next && router.navigate(next as never)} />}
    >
      <View style={styles.title}>
        <EchoText variant="displayM" align="center" accessibilityRole="header">
          {title}
        </EchoText>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({ title: { marginTop: 34 } });
