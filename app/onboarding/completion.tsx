import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ReflectionCard } from '@/components/ReflectionCard';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import { haptics } from '@/services/haptics';
import { reflectionService, type ReflectionResult } from '@/services/reflection';
import { attachReflection, useJournal, type JournalEntry } from '@/state/journal';
import { markOnboardingComplete, setCurrentStep } from '@/state/onboardingSelections';

const HOME = '/home' as Href;
const REFLECTION_CONSENT_VERSION = 'reflection-v1';

export default function CompletionScreen() {
  const router = useRouter();
  const entries = useJournal();
  const entry = entries[0] ?? null;
  const [reflection, setReflection] = useState<ReflectionResult | 'loading'>('loading');

  const enterSpace = useCallback(() => {
    markOnboardingComplete();
    haptics.medium();
    router.replace(HOME);
  }, [router]);

  useEffect(() => {
    setCurrentStep(8);
  }, []);

  // Back navigation is disabled; system back returns Home once the entry is committed.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      enterSpace();
      return true;
    });
    return () => subscription.remove();
  }, [enterSpace]);

  const loadReflection = useCallback(() => loadReflectionResult(entry), [entry]);

  useEffect(() => {
    let active = true;
    void loadReflection().then((result) => {
      if (active) {
        setReflection(result);
      }
    });
    return () => {
      active = false;
    };
  }, [loadReflection]);

  const savedMinutes = Math.max(1, Math.round((entry?.durationSeconds ?? 0) / 60));

  const card =
    reflection === 'loading' ? (
      <ReflectionCard onContinue={enterSpace} state="loading" />
    ) : reflection.status === 'complete' ? (
      <ReflectionCard onContinue={enterSpace} state="complete" text={reflection.text} />
    ) : reflection.status === 'error' ? (
      <ReflectionCard
        onContinue={enterSpace}
        onRetry={() => {
          setReflection('loading');
          void loadReflection().then(setReflection);
        }}
        state="error"
      />
    ) : reflection.status === 'offline' ? (
      <ReflectionCard onContinue={enterSpace} state="offline" />
    ) : (
      <SavedPrivatelyCard minutes={savedMinutes} />
    );

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <OnboardingScaffold
        currentStep={8}
        footer={<PrimaryCTA label="Enter your space" onPress={enterSpace} />}
        screen="completion"
        subtitle="That is the whole practice."
        title="You made space for yourself."
      >
        {card}
      </OnboardingScaffold>
    </>
  );
}

/** Reflection is optional; the entry is already committed either way. */
async function loadReflectionResult(entry: JournalEntry | null): Promise<ReflectionResult> {
    const availability = await reflectionService.availability();
    if (availability === 'unavailable' || !entry) {
      return { status: 'unavailable' };
    }
    const result = await reflectionService.request({
      body: entry.body ?? '',
      consentVersion: REFLECTION_CONSENT_VERSION,
      entryId: entry.id,
      promptId: entry.promptId,
    });
    if (result.status === 'complete') {
      attachReflection(entry.id, { status: 'complete', text: result.text });
    }
    return result;
}

/** Shown when AI reflection is unavailable; saving never depends on it. */
function SavedPrivatelyCard({ minutes }: { minutes: number }) {
  const { theme } = useEchoTheme();
  return (
    <GlassCard padding={24} style={styles.savedCard} variant="strong">
      <Text style={[styles.eyebrow, { color: theme.color.textSecondary }]}>TODAY’S ECHO</Text>
      <View style={styles.savedBody}>
        <Text style={[styles.savedTitle, { color: theme.color.textPrimary }]}>
          {`Saved privately · ${minutes} minutes`}
        </Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  savedCard: { alignSelf: 'stretch' },
  eyebrow: {
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
  savedBody: { marginTop: tokens.space[12] },
  savedTitle: {
    ...tokens.type.display,
    fontSize: tokens.typography.bodyL.size + 4,
    lineHeight: tokens.typography.bodyL.lineHeight + 8,
  },
});
