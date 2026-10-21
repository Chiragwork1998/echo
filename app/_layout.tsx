import {
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_500Medium,
} from '@expo-google-fonts/cormorant-garamond';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EchoThemeProvider } from '@/design/ThemeProvider';
import { initializeNotifications } from '@/services/notifications';
import { voiceCapture } from '@/services/voice';
import { hydrateJournal, restoreRecordingDraft } from '@/state/journal';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_400Regular_Italic,
    CormorantGaramond_500Medium,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Native core bootstrap: hydrate encrypted local data, recover a recording
  // left behind by an interruption, and prepare local notifications. None of
  // these steps block rendering, and none of them log journal content.
  useEffect(() => {
    void (async () => {
      await hydrateJournal();
      const recovered = await voiceCapture.recoverInterrupted();
      if (recovered?.localPath) {
        restoreRecordingDraft({
          audioPath: recovered.localPath,
          durationSeconds: recovered.durationSeconds,
          promptId: recovered.promptId ?? 'first_echo',
          promptTextSnapshot: recovered.promptTextSnapshot ?? '',
        });
      }
    })();
    void initializeNotifications();
  }, []);

  if (!fontsLoaded) {
    return <View style={styles.fontHold} />;
  }

  return (
    <SafeAreaProvider>
      <EchoThemeProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      </EchoThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ fontHold: { flex: 1, backgroundColor: '#0B1D35' } });
