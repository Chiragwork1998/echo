import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { SecondaryButton } from '@/components/SecondaryButton';
import { ToggleRow } from '@/components/ToggleRow';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import {
  AUTH_PROVIDERS,
  EMAIL_CODE_LENGTH,
  authService,
  isValidEmail,
  type AuthProvider,
  type AuthResult,
} from '@/services/auth';
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

type AuthStep = 'choose' | 'email' | 'code';

const AUTH_MESSAGES = {
  cancelled: 'No account was created. You can add a private backup later from You.',
  unavailable: 'Sign-in is not configured in this build. Your journal stays on this device.',
  failed: 'Sign-in did not finish. Check your connection and try again.',
  sendFailed: 'We could not send a code. Check the address and try again.',
  rateLimited: 'Please wait a minute before asking for another code.',
  codeFailed: 'That code did not work. Check it, or send a new code.',
} as const;

export default function PrivacyScreen() {
  const router = useRouter();
  const { theme } = useEchoTheme();
  const privacy = useOnboardingState((state) => state.privacy);
  const [biometricKind, setBiometricKind] = useState<BiometricKind>('face');
  const [authOpen, setAuthOpen] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('choose');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

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

  const openAuth = () => {
    setAuthStep('choose');
    setAuthMessage(null);
    setCode('');
    setAuthOpen(true);
  };

  const closeAuth = () => {
    if (!authBusy) {
      setAuthOpen(false);
    }
  };

  const protect = async () => {
    if (privacy.biometricLockEnabled && biometricKind === 'none') {
      // Degrade gracefully rather than promising a lock the device cannot keep.
      setBiometricLockEnabled(false);
    }
    if (privacy.privateBackupEnabled && !privacy.authenticated) {
      openAuth();
      return;
    }
    router.push(NEXT);
  };

  const finish = (result: AuthResult, failedMessage: string) => {
    if (result.status === 'authenticated') {
      setAuthenticated(true);
      setAuthOpen(false);
      router.push(NEXT);
      return;
    }
    setAuthMessage(
      result.status === 'cancelled'
        ? AUTH_MESSAGES.cancelled
        : result.status === 'unavailable'
          ? AUTH_MESSAGES.unavailable
          : failedMessage,
    );
  };

  const run = async (task: () => Promise<void>) => {
    if (authBusy) {
      return;
    }
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      await task();
    } finally {
      setAuthBusy(false);
    }
  };

  const chooseProvider = (provider: AuthProvider) => {
    if (provider === 'email') {
      setAuthMessage(null);
      setAuthStep('email');
      return;
    }
    void run(async () => {
      finish(await authService.signInWithGoogle(), AUTH_MESSAGES.failed);
    });
  };

  const trimmedEmail = email.trim().toLowerCase();
  const canSendCode = isValidEmail(trimmedEmail) && !authBusy;
  const canVerify = code.length === EMAIL_CODE_LENGTH && !authBusy;

  const sendCode = () => {
    if (!canSendCode) {
      return;
    }
    void run(async () => {
      const request = await authService.requestEmailCode(trimmedEmail);
      if (request === 'sent') {
        setCode('');
        setAuthStep('code');
        return;
      }
      setAuthMessage(
        request === 'rate_limited'
          ? AUTH_MESSAGES.rateLimited
          : request === 'unavailable'
            ? AUTH_MESSAGES.unavailable
            : AUTH_MESSAGES.sendFailed,
      );
    });
  };

  const verifyCode = () => {
    if (!canVerify) {
      return;
    }
    void run(async () => {
      finish(await authService.verifyEmailCode(trimmedEmail, code), AUTH_MESSAGES.codeFailed);
    });
  };

  const sheetBody =
    authStep === 'choose'
      ? 'Backup is optional. Signing in only stores encrypted copies you can restore later.'
      : authStep === 'email'
        ? 'Enter your email and we will send you a 6-digit code.'
        : `Enter the 6-digit code we sent to ${trimmedEmail}.`;

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.color.surfaceGlass,
      borderColor: theme.color.borderGlass,
      color: theme.color.textPrimary,
    },
  ];

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

      <Modal animationType="fade" onRequestClose={closeAuth} transparent visible={authOpen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.backdrop}
        >
          <GlassCard padding={tokens.space[24]} style={styles.sheet} variant="strong">
            <Text style={[styles.sheetTitle, { color: theme.color.textPrimary }]}>
              Sign in to keep a private backup
            </Text>
            <Text style={[styles.sheetBody, { color: theme.color.textSecondary }]}>{sheetBody}</Text>

            {authStep === 'choose' ? (
              <View style={styles.sheetActions}>
                {AUTH_PROVIDERS.map((provider) => (
                  <SecondaryButton
                    disabled={authBusy}
                    key={provider.id}
                    label={provider.label}
                    onPress={() => chooseProvider(provider.id)}
                  />
                ))}
              </View>
            ) : null}

            {authStep === 'email' ? (
              <View style={styles.sheetActions}>
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  autoFocus
                  editable={!authBusy}
                  inputMode="email"
                  keyboardType="email-address"
                  maxLength={320}
                  onChangeText={setEmail}
                  onSubmitEditing={sendCode}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.color.textSecondary}
                  returnKeyType="send"
                  style={inputStyle}
                  textContentType="emailAddress"
                  value={email}
                />
                <SecondaryButton disabled={!canSendCode} label="Send code" onPress={sendCode} />
              </View>
            ) : null}

            {authStep === 'code' ? (
              <View style={styles.sheetActions}>
                <TextInput
                  accessibilityLabel="Six-digit code"
                  autoComplete="one-time-code"
                  autoFocus
                  editable={!authBusy}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={EMAIL_CODE_LENGTH}
                  onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
                  onSubmitEditing={verifyCode}
                  placeholder="000000"
                  placeholderTextColor={theme.color.textSecondary}
                  returnKeyType="done"
                  style={[inputStyle, styles.codeInput]}
                  textContentType="oneTimeCode"
                  value={code}
                />
                <SecondaryButton disabled={!canVerify} label="Verify code" onPress={verifyCode} />
                <SecondaryButton
                  disabled={authBusy}
                  label="Send a new code"
                  onPress={sendCode}
                  variant="ghost"
                />
              </View>
            ) : null}

            {authBusy ? (
              <ActivityIndicator
                accessibilityLabel="Signing in"
                color={theme.color.textSecondary}
                style={styles.spinner}
              />
            ) : null}

            {authMessage ? (
              <Text accessibilityLiveRegion="polite" style={[styles.sheetNotice, { color: theme.color.textSecondary }]}>
                {authMessage}
              </Text>
            ) : null}

            {authStep !== 'choose' ? (
              <SecondaryButton
                disabled={authBusy}
                label="Use another option"
                onPress={() => {
                  setAuthMessage(null);
                  setAuthStep('choose');
                }}
                style={styles.sheetSecondary}
                variant="ghost"
              />
            ) : null}
            <SecondaryButton
              disabled={authBusy}
              label="Continue without backup"
              onPress={() => {
                setAuthOpen(false);
                router.push(NEXT);
              }}
              style={styles.sheetSecondary}
              variant="ghost"
            />
          </GlassCard>
        </KeyboardAvoidingView>
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
  input: {
    minHeight: tokens.size.tapTarget,
    borderRadius: tokens.control.pillRadius,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.space[16],
    ...tokens.type.ui,
    fontSize: tokens.typography.bodyM.size,
  },
  codeInput: { textAlign: 'center', letterSpacing: 6 },
  spinner: { marginTop: tokens.space[12] },
  sheetNotice: {
    marginTop: tokens.space[12],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    lineHeight: tokens.typography.caption.lineHeight + 2,
  },
  sheetSecondary: { marginTop: tokens.space[8] },
});
