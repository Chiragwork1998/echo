import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import { haptics } from '@/services/haptics';
import { useJournal } from '@/state/journal';
import { getAuthSession } from '@/state/authSession';
import { flushOnboardingPersistence, markOnboardingComplete, setCurrentStep } from '@/state/onboardingSelections';

export default function CompletionScreen() {
  const router = useRouter();
  const entries = useJournal();
  const entry = entries[0] ?? null;
  const { theme } = useEchoTheme();
  const entering = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const enterSpace = useCallback(async () => {
    if (entering.current) return;
    entering.current = true;
    setBusy(true);
    setNotice('');
    try {
      markOnboardingComplete();
      await flushOnboardingPersistence();
      haptics.medium();
      const auth = getAuthSession();
      router.replace(auth.status === 'guest' && !auth.entryChoiceMade ? '/sign-in' : '/home');
    } catch {
      entering.current = false;
      setBusy(false);
      setNotice('Your progress could not be saved yet. Please try again. Your echo is still kept.');
    }
  }, [router]);

  useEffect(() => { setCurrentStep(8); }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { void enterSpace(); return true; });
    return () => subscription.remove();
  }, [enterSpace]);

  const savedMinutes = Math.max(1, Math.round((entry?.durationSeconds ?? 0) / 60));
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <OnboardingScaffold currentStep={8} footer={<PrimaryCTA label={busy ? 'Opening…' : 'Enter your space'} disabled={busy} onPress={() => void enterSpace()} />} screen="completion" subtitle="That is the whole practice." title="You made space for yourself.">
        <GlassCard padding={24} style={styles.savedCard} variant="strong">
          <Text style={[styles.eyebrow, { color: theme.color.textSecondary }]}>TODAY’S ECHO</Text>
          <View style={styles.savedBody}>
            <Text style={[styles.savedTitle, { color: theme.color.textPrimary }]}>{`Saved privately · ${savedMinutes} minutes`}</Text>
          </View>
        </GlassCard>
        {notice ? <Text accessibilityRole="alert" style={[styles.notice, { color: theme.color.textSecondary }]}>{notice}</Text> : null}
      </OnboardingScaffold>
    </>
  );
}

const styles = StyleSheet.create({
  savedCard: { alignSelf: 'stretch' },
  eyebrow: { ...tokens.type.ui, fontSize: tokens.typography.caption.size, letterSpacing: tokens.typography.caption.tracking, lineHeight: tokens.typography.caption.lineHeight },
  savedBody: { marginTop: tokens.space[12] },
  savedTitle: { ...tokens.type.display, fontSize: tokens.typography.bodyL.size + 4, lineHeight: tokens.typography.bodyL.lineHeight + 8 },
  notice: { marginTop: 16, ...tokens.type.ui, fontSize: 12, lineHeight: 18 },
});
