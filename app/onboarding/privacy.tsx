import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ToggleRow } from '@/components/ToggleRow';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import { biometricToggleLabel, deviceCapabilities, type BiometricKind } from '@/services/capabilities';
import { setBiometricLockEnabled, setCurrentStep, useOnboardingState } from '@/state/onboardingSelections';

export default function PrivacyScreen() {
  const router = useRouter();
  const { theme } = useEchoTheme();
  const privacy = useOnboardingState(state => state.privacy);
  const [kind, setKind] = useState<BiometricKind>('none');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setCurrentStep(5);
    let active = true;
    void deviceCapabilities.biometrics.kind().then(value => { if (active) setKind(value); });
    return () => { active = false; };
  }, []);

  const toggleLock = async (enabled: boolean) => {
    if (busy) return;
    if (!enabled) { setBiometricLockEnabled(false); return; }
    setBusy(true);
    setNotice('');
    try {
      const result = await deviceCapabilities.biometrics.authenticate('Enable your journal lock');
      if (result === 'success') setBiometricLockEnabled(true);
      else setNotice('The lock was not enabled. You can try again, or set it up later in You.');
    } finally { setBusy(false); }
  };

  return (
    <OnboardingScaffold currentStep={5} screen="privacy" title="Leave no trace." subtitle="What you write belongs to you." onBack={() => router.back()} footer={<PrimaryCTA label="Protect my journal" disabled={busy} onPress={() => router.push('/onboarding/arrival')} />}>
      <View style={styles.rows}>
        <ToggleRow disabled={kind === 'none' || busy} icon="lock" label={biometricToggleLabel()} value={kind !== 'none' && privacy.biometricLockEnabled} onValueChange={enabled => void toggleLock(enabled)} unavailableCaption={kind === 'none' ? 'Device biometrics are unavailable here; you can enable the lock later.' : undefined} />
        <ToggleRow disabled icon="book" label="Keep a private backup" value={false} onValueChange={() => undefined} unavailableCaption="Private backup is not available in this build. Your journal stays on this device." />
      </View>
      <Text style={[styles.caption, { color: theme.color.textSecondary }]}>Encrypted on your phone. Your words stay yours.</Text>
      {notice ? <Text accessibilityRole="alert" style={[styles.notice, { color: theme.color.textSecondary }]}>{notice}</Text> : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: tokens.space[12] },
  caption: { marginTop: tokens.space[16], ...tokens.type.ui, fontSize: tokens.typography.caption.size, letterSpacing: tokens.typography.caption.tracking, lineHeight: tokens.typography.caption.lineHeight, textAlign: 'center' },
  notice: { marginTop: tokens.space[12], ...tokens.type.ui, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
