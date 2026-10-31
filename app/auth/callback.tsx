import * as Linking from 'expo-linking';

import { useRouter } from 'expo-router';

import { useEffect, useState } from 'react';

import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { MotionButton } from '@/components/MotionButton';

import { useEchoTheme } from '@/design/ThemeProvider';

import { tokens } from '@/design/tokens';

import { finishAuthCallback } from '@/services/auth';

import { prepareAccountSignIn, retryAuthSession } from '@/state/authSession';



export default function AuthCallbackScreen() {

  const router = useRouter();

  const { theme } = useEchoTheme();

  const [failed, setFailed] = useState(false);

  useEffect(() => {

    let active = true;

    void (async () => {

      await prepareAccountSignIn();

      const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : await Linking.getInitialURL();

      const result = url ? await finishAuthCallback(url) : { status: 'failed' };

      if (result.status === 'authenticated') await retryAuthSession();

      else if (active) setFailed(true);

    })();

    return () => { active = false; };

  }, []);

  return <View style={[styles.screen, { backgroundColor: theme.color.textInk }]}>

    <Text style={[styles.title, { color: theme.color.textPrimary }]}>{failed ? 'Let’s try that again.' : 'Opening your space.'}</Text>

    {failed ? <><Text style={[styles.body, { color: theme.color.textSecondary }]}>This sign-in link did not finish or has expired. Return to sign in and request a fresh email.</Text><MotionButton label="Back to sign in" onPress={() => router.replace('/sign-in')} /></> : <ActivityIndicator color={theme.color.accentWarm} accessibilityLabel="Completing sign-in" />}

  </View>;

}

const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 24 }, title: { ...tokens.type.display, fontSize: 36, lineHeight: 42, textAlign: 'center' }, body: { ...tokens.type.ui, fontSize: 14, lineHeight: 23, textAlign: 'center' } });

