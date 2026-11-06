import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';

import { fontMap } from '@/design/fonts';
import { ThemeProvider, useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useOnboarding } from '@/state/onboarding';
import { goldenFixtures } from '@/testing/goldenFixtures';
import { qa } from '@/testing/qa';

SplashScreen.preventAutoHideAsync();

if (qa.fixture) useOnboarding.setState(goldenFixtures[qa.fixture] ?? {});

const referenceInsets = { top: 59, bottom: 34, left: 0, right: 0 };

/** The harness has no notch, so it supplies the reference device's insets. */
function SafeArea({ children }: PropsWithChildren) {
  if (!qa.enabled) return <SafeAreaProvider>{children}</SafeAreaProvider>;
  return (
    <SafeAreaProvider>
      <SafeAreaInsetsContext.Provider value={referenceInsets}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const { colors } = useTheme();
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: tokens.motion.screen,
          contentStyle: { backgroundColor: colors.textInk },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeArea>
        <ThemeProvider>
          <Navigator />
        </ThemeProvider>
      </SafeArea>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
