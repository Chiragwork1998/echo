import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { SecondaryButton } from '@/components/SecondaryButton';
import { ToggleRow } from '@/components/ToggleRow';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import { AUTH_PROVIDERS, authService, type AuthProvider } from '@/services/auth';
import { biometricToggleLabel, deviceCapabilities, type BiometricKind } from '@/services/capabilities';
import {
  setAuthenticated,
  setBiometricLockEnabled,
  setCurrentStep,
  setPrivateBackupEnabled,
  useOnboardingRestore,
  useOnboardingState,
} from '@/state/onboardingSelections';

const NEXT = '/onboarding/arrival' as Href;

export default function PrivacyScreen() {
  const router = useRouter();
  const { theme } = useEchoTheme();
  const privacy = useOnboardingState((state) => state.privacy);
  const [biometricKind, setBiometricKind] = useState<BiometricKind>('face');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useOnboardingRestore();

  useEffect(() => {
    setCurrentStep(5);
    let active = true;
    void deviceCapabilities.biometrics.kind().then((kind) => {
      if (active) {
        setBiometricKind(kind);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const protect = async () => {
    if (privacy.biometricLockEnabled && biometricKind === 'none') {
      // Degrade gracefully rather than promising a lock the device cannot keep.
      setBiometricLockEnabled(false);
    }
    if (privacy.privateBackupEnabled && !privacy.authenticated) {
      setAuthMessage(null);
      setAuthOpen(true);
      return;
    }
    router.push(NEXT);
  };

  const chooseProvider = async (provider: AuthProvider) => {
    const result = await authService.signIn(provider);
    if (result.status === 'authenticated') {
      setAuthenticated(true);
      setAuthOpen(false);
      router.push(NEXT);
      return;
    }
    setAuthMessage(
      result.status === 'cancelled'
        ? 'No account was created. You can add a private backup later from You.'
        : 'Sign-in is not configured in this build. Your journal stays on this device.',
    );
  };

  return (
    <OnboardingScaffold
      currentStep={5}
      footer={
        <PrimaryCTA
          label="Protect my journal"
          onPress={() => {
            void protect();
          }}
        />
      }
      onBack={() => router.back()}
      screen="privacy"
      subtitle="What you write belongs to you."
      title="Leave no trace."
    >
      <View style={styles.rows}>
        <ToggleRow
          disabled={biometricKind === 'none'}
          icon="lock"
          label={biometricToggleLabel()}
          onValueChange={setBiometricLockEnabled}
          unavailableCaption={
            biometricKind === 'none'
              ? 'Device biometrics are unavailable here; you can enable the lock later.'
              : undefined
          }
          value={biometricKind === 'none' ? false : privacy.biometricLockEnabled}
        />
        <ToggleRow
          icon="book"
          label="Keep a private backup"
          onValueChange={setPrivateBackupEnabled}
          value={privacy.privateBackupEnabled}
        />
      </View>

      <Text style={[styles.caption, { color: theme.color.textSecondary }]}>
        Encrypted before it leaves your phone.
      </Text>

      <Modal
        animationType="fade"
        onRequestClose={() => setAuthOpen(false)}
        transparent
        visible={authOpen}
      >
        <View style={styles.backdrop}>
          <GlassCard padding={tokens.space[24]} style={styles.sheet} variant="strong">
            <Text style={[styles.sheetTitle, { color: theme.color.textPrimary }]}>
              Sign in to keep a private backup
            </Text>
            <Text style={[styles.sheetBody, { color: theme.color.textSecondary }]}>
              Backup is optional. Signing in only stores encrypted copies you can restore later.
            </Text>
            <View style={styles.sheetActions}>
              {AUTH_PROVIDERS.map((provider) => (
                <SecondaryButton
                  key={provider.id}
                  label={provider.label}
                  onPress={() => {
                    void chooseProvider(provider.id);
                  }}
                />
              ))}
            </View>
            {authMessage ? (
              <Text accessibilityLiveRegion="polite" style={[styles.sheetNotice, { color: theme.color.textSecondary }]}>
                {authMessage}
              </Text>
            ) : null}
            <SecondaryButton
              label="Continue without backup"
              onPress={() => {
                setAuthOpen(false);
                router.push(NEXT);
              }}
              style={styles.sheetSecondary}
              variant="ghost"
            />
          </GlassCard>
        </View>
      </Modal>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: tokens.space[12] },
  caption: {
    marginTop: tokens.space[16],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[24],
    backgroundColor: 'rgba(2,10,20,0.62)',
  },
  sheet: { width: '100%', maxWidth: 345 },
  sheetTitle: {
    ...tokens.type.display,
    fontSize: tokens.typography.displayM.size - 8,
    lineHeight: tokens.typography.displayM.lineHeight - 8,
  },
  sheetBody: {
    marginTop: tokens.space[8],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size + 1,
    lineHeight: tokens.typography.caption.lineHeight + 4,
  },
  sheetActions: { marginTop: tokens.space[12], gap: tokens.space[8] },
  sheetNotice: {
    marginTop: tokens.space[12],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    lineHeight: tokens.typography.caption.lineHeight + 2,
  },
  sheetSecondary: { marginTop: tokens.space[8] },
});
