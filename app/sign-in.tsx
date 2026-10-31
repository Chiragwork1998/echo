import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { EchoBackground } from '@/components/EchoBackground';
import { GlassCard } from '@/components/GlassCard';
import { MotionButton } from '@/components/MotionButton';
import { SecondaryButton } from '@/components/SecondaryButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { screenBackgrounds, screenFocalPoints } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import { authService, isValidEmail } from '@/services/auth';
import { supabase } from '@/services/supabase';
import { getOnboardingSelections, resolveResumeRoute } from '@/state/onboardingSelections';
import type { Href } from 'expo-router';
import { enterGuestMode, prepareAccountSignIn, retryAuthSession, signOutAccount, useAuthSession } from '@/state/authSession';

export default function SignInScreen() {
  const router = useRouter();
  const { theme, name } = useEchoTheme();
  const auth = useAuthSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [focusedInput, setFocusedInput] = useState<'email' | 'code' | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | 'verify' | 'switch' | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  const configured = Boolean(supabase);
  const mismatch = auth.status === 'account-mismatch';
  const normalizedEmail = email.trim().toLowerCase();
  const canSend = isValidEmail(normalizedEmail) && !busy && configured;
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  const run = async (kind: NonNullable<typeof busy>, work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(kind); setMessage('');
    try { await work(); } catch { setMessage('That did not finish. Check your connection and try again.'); }
    finally { inFlight.current = false; setBusy(null); }
  };
  const send = (resend = false) => {
    if (!canSend || (resend && Date.now() < resendAt)) return;
    void run('email', async () => {
      await prepareAccountSignIn();
      const result = await authService.requestEmailCode(resend ? sentTo : normalizedEmail);
      if (result === 'sent') {
        setSentTo(resend ? sentTo : normalizedEmail); setCode(''); setStep('code'); setResendAt(Date.now() + 60_000); setSeconds(60);
        if (resend) setMessage('A fresh email is on its way. Use the latest code or link.');
      } else if (result === 'rate_limited') {
        setResendAt(Date.now() + 60_000); setSeconds(60); setMessage('Please wait a minute before asking for another email.');
      } else setMessage(result === 'unavailable' ? 'Email sign-in is not available in this build.' : 'We could not send the email. Check the address and your connection, then try again.');
    });
  };
  const verify = () => {
    if (!/^\d{6,10}$/.test(code) || busy) return;
    void run('verify', async () => {
      await prepareAccountSignIn();
      const result = await authService.verifyEmailCode(sentTo, code);
      if (result.status === 'authenticated') await retryAuthSession();
      else setMessage('That code did not work or has expired. Use the latest code, or send a new email.');
    });
  };
  const google = () => void run('google', async () => {
    await prepareAccountSignIn();
    const result = await authService.signInWithGoogle();
    if (result.status === 'authenticated') await retryAuthSession();
    else if (result.status === 'cancelled') setMessage('Sign-in was cancelled. Your space will be here when you are ready.');
    else if (result.status !== 'redirecting') setMessage('Google sign-in did not finish. Try again, or continue with email.');
  });
  const primary = { color: theme.color.textPrimary };
  const secondary = { color: theme.color.textSecondary };
  const inputStyle = [styles.input, { color: theme.color.textPrimary, backgroundColor: focusedInput ? theme.color.surfaceSelected : theme.color.surfaceGlass }];

  return <AppShell theme={theme} background={<EchoBackground source={screenBackgrounds[name].landing} focalPoint={screenFocalPoints.landing} fallbackColor={theme.color.textInk} />}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.brand}><ThemeToggle><Text style={[styles.wordmark, primary]}>ECHO</Text></ThemeToggle><View style={[styles.rule, { backgroundColor: theme.color.accentWarm }]} /><Text style={[styles.eyebrow, secondary]}>SIGN UP / SIGN IN</Text></View>
        <View style={styles.hero}><Text accessibilityRole="header" style={[styles.title, primary]}>{mismatch ? 'Your words belong\nto you.' : step === 'code' ? 'An invitation\nto come back.' : 'Come as\nyou are.'}</Text><Text style={[styles.subtitle, secondary]}>{mismatch ? 'This device already holds a private journal.' : step === 'code' ? `Check your inbox at ${sentTo}.` : 'For new and returning accounts.\nOr skip and keep your journal on this device.'}</Text></View>
        <GlassCard padding={24} variant="strong" style={styles.card}>
          {mismatch ? <View style={styles.actions}>
            <Text style={[styles.body, secondary]}>{auth.error}</Text>
            <Text style={[styles.body, primary]}>Signed in as {auth.user?.email ?? 'another account'}</Text>
            <MotionButton label="Use the original account" busy={busy === 'switch'} onPress={() => void run('switch', signOutAccount)} />
          </View> : <View style={styles.actions}>
            {auth.status === 'error' ? <><Text accessibilityRole="alert" style={[styles.body, secondary]}>{auth.error}</Text><MotionButton label="Try my saved session again" onPress={() => void retryAuthSession()} /><SecondaryButton label="Sign in again" onPress={() => void run('switch', signOutAccount)} /></> : !configured ? <Text accessibilityRole="alert" style={[styles.body, secondary]}>Account sign-in is not configured in this build. You can still choose Skip to use your local journal.</Text> : step === 'email' ? <>
              <MotionButton label="Continue with Google" busy={busy === 'google'} disabled={Boolean(busy)} onPress={google} />
              <View style={styles.separator}><View style={[styles.line, { backgroundColor: theme.color.borderGlass }]} /><Text style={[styles.or, secondary]}>OR WITH EMAIL</Text><View style={[styles.line, { backgroundColor: theme.color.borderGlass }]} /></View>
              <Text style={[styles.label, secondary]}>YOUR EMAIL</Text>
              <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" inputMode="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={theme.color.textSecondary} value={email} onChangeText={value => { setEmail(value); setMessage(''); }} onSubmitEditing={() => send()} onFocus={() => setFocusedInput('email')} onBlur={() => setFocusedInput(null)} underlineColorAndroid="transparent" editable={!busy} maxLength={320} returnKeyType="send" style={inputStyle} />
              <MotionButton label="Continue with email" tone="glass" busy={busy === 'email'} disabled={!canSend || seconds > 0} onPress={() => send()} />
              {auth.error ? <Text style={[styles.body, secondary]}>{auth.error}</Text> : null}
            </> : <>
              <Text style={[styles.body, secondary]}>Open the sign-in link in your email, or enter the code if your email includes one.</Text>
              <TextInput accessibilityLabel="Sign-in code" autoComplete="one-time-code" textContentType="oneTimeCode" inputMode="numeric" keyboardType="number-pad" value={code} onChangeText={value => setCode(value.replace(/\D/g, ''))} onSubmitEditing={verify} onFocus={() => setFocusedInput('code')} onBlur={() => setFocusedInput(null)} underlineColorAndroid="transparent" editable={!busy} maxLength={10} placeholder="Enter code" placeholderTextColor={theme.color.textSecondary} style={[inputStyle, styles.code]} returnKeyType="done" />
              <MotionButton label="Open my journal" busy={busy === 'verify'} disabled={!/^\d{6,10}$/.test(code) || Boolean(busy)} onPress={verify} />
              <SecondaryButton label={seconds > 0 ? `Send again in ${seconds}s` : 'Send a new email'} disabled={Boolean(busy) || seconds > 0} onPress={() => send(true)} variant="ghost" />
              <SecondaryButton label="Use a different email" disabled={Boolean(busy)} onPress={() => { setStep('email'); setMessage(''); setCode(''); }} variant="ghost" />
            </>}
            {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.notice, primary]}>{message}</Text> : null}
          </View>}
        </GlassCard>
        <SecondaryButton label="Skip" disabled={Boolean(busy)} onPress={() => void run('switch', async () => { await enterGuestMode(); if (auth.status === 'guest') { const state = getOnboardingSelections(); router.replace((state.completedAt ? '/home' : resolveResumeRoute(state) ?? '/') as Href); } })} variant="ghost" style={{ marginTop: 18 }} />
        <Text style={[styles.privacy, secondary]}>Your journal stays encrypted on this device.{"\n"}Signing in does not upload your words.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </AppShell>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, scroll: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 24, flexGrow: 1, alignItems: 'center' },
  brand: { alignItems: 'center', gap: 10 }, wordmark: { ...tokens.type.display, fontSize: 30, lineHeight: 38, letterSpacing: 7 }, rule: { width: 24, height: 1, opacity: 0 }, eyebrow: { ...tokens.type.ui, fontSize: 9, lineHeight: 16, letterSpacing: 2.2 },
  hero: { paddingTop: 30, paddingBottom: 28, alignItems: 'center', width: '100%' }, title: { ...tokens.type.display, fontSize: 49, lineHeight: 49, textAlign: 'center' }, subtitle: { ...tokens.type.ui, fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 15 },
  card: { width: '100%', maxWidth: 390 }, actions: { gap: 14 }, separator: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 3 }, line: { flex: 1, height: 1, opacity: 0 }, or: { ...tokens.type.ui, fontSize: 9, lineHeight: 14, letterSpacing: 1.4 },
  label: { ...tokens.type.ui, fontSize: 10, lineHeight: 14, letterSpacing: 1.5 }, input: { minHeight: 54, borderRadius: 14, borderWidth: 0, outlineWidth: 0, outlineStyle: 'solid', paddingHorizontal: 16, ...tokens.type.ui, fontSize: 15, lineHeight: 22 }, code: { textAlign: 'center', fontSize: 20, letterSpacing: 3 },
  body: { ...tokens.type.ui, fontSize: 13, lineHeight: 21 }, notice: { ...tokens.type.ui, fontSize: 12, lineHeight: 19 }, privacy: { ...tokens.type.ui, fontSize: 10, lineHeight: 18, textAlign: 'center', marginTop: 24 },
});
