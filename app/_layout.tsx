import '@/navigation/webHistoryGuard';
import {
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_500Medium,
} from "@expo-google-fonts/cormorant-garamond";
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import {
  Stack,
  usePathname,
  useGlobalSearchParams,
  useRootNavigationState,
  useRouter,
  type Href,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, View } from "react-native";
import { initializeAuthSession, useAuthSession } from "@/state/authSession";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { getWorkspaceScope } from "@/storage/workspace";
import { EchoThemeProvider } from "@/design/ThemeProvider";
import { PrimaryCTA } from "@/components/PrimaryCTA";
import { Companion } from "@/features/avatar/Companion";
import { deviceCapabilities } from "@/services/capabilities";
import {
  getOnboardingSelections,
  restoreOnboardingState,
  resolveResumeRoute,
  useOnboardingState,
} from "@/state/onboardingSelections";
import { initializeNotifications } from "@/services/notifications";
import { voiceCapture } from "@/services/voice";
import {
  getJournalStatus,
  retryJournalHydration,
  restoreRecordingDraft,
} from "@/state/journal";

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

  const auth = useAuthSession();
  useEffect(() => { void initializeAuthSession(); }, []);
  if (!fontsLoaded) return <View style={styles.fontHold} />;
  return <SafeAreaProvider><EchoThemeProvider><StatusBar style="light" />
    {auth.status === 'loading' ? <View style={styles.lock}><Text style={styles.lockTitle}>A little space for you.</Text><ActivityIndicator color="#F4EFE6" accessibilityLabel="Opening your session" /></View>
      : auth.status === 'signed-in' || auth.status === 'guest' ? <PrivateWorkspace key={auth.user?.id ?? 'guest'} guest={auth.status === 'guest'} entryChoiceMade={auth.entryChoiceMade} /> : <PublicNavigator />}
  </EchoThemeProvider></SafeAreaProvider>;
}

const MAIN_ROUTES = ['home', 'echoes', 'patterns', 'you', 'journal', 'journal-complete', 'entry/[id]'] as const;
const PRIVATE_ROUTES = ['index', 'onboarding', ...MAIN_ROUTES] as const;
function PublicNavigator() {
  return <Stack initialRouteName="sign-in" screenOptions={{ headerShown: false, animation: 'fade' }}>
    <Stack.Screen name="sign-in" /><Stack.Screen name="auth/callback" />
    <Stack.Protected guard={false}>{PRIVATE_ROUTES.map(name => <Stack.Screen name={name} key={name} />)}</Stack.Protected>
  </Stack>;
}

function PrivateWorkspace({ guest, entryChoiceMade }: { guest: boolean; entryChoiceMade: boolean }) {
  const completedAt = useOnboardingState(state => state.completedAt);
  const canOpenMainApp = Boolean(completedAt) && (!guest || entryChoiceMade);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<'settings' | 'journal' | null>(null);
  const [opening, setOpening] = useState(true);
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [lockMessage, setLockMessage] = useState(
    "Your words are waiting for you.",
  );
  const loaded = useRef(false);
  const loadJournal = useCallback(async () => {
    if (!loaded.current) {
      setLoadError(null);
      await retryJournalHydration();
      if (getJournalStatus() === "error") {
        setLoadError('journal');
        return;
      }
      const recovered = await voiceCapture
        .recoverInterrupted()
        .catch(() => null);
      if (recovered?.localPath && recovered.workspace === getWorkspaceScope())
        restoreRecordingDraft({
          audioPath: recovered.localPath,
          durationSeconds: recovered.durationSeconds,
          promptId: recovered.promptId ?? "first_echo",
          promptTextSnapshot: recovered.promptTextSnapshot ?? "",
        });
      loaded.current = true;
    }
    setReady(true);
  }, []);
  const unlock = useCallback(async () => {
    setUnlocking(true);
    try {
      const result = await deviceCapabilities.biometrics.authenticate(
        "Unlock your journal",
      );
      if (result === "success") {
        await loadJournal();
        setLocked(false);
      } else
        setLockMessage(
          "Unlock with your device authentication to return to your journal.",
        );
    } finally {
      setUnlocking(false);
    }
  }, [loadJournal]);
  const openApp = useCallback(async () => {
    try {
      await restoreOnboardingState();
    } catch {
      setLoadError('settings');
      setOpening(false);
      return;
    }
    setLoadError(null);
    try {
      if (getOnboardingSelections().privacy.biometricLockEnabled && !loaded.current)
        setLocked(true);
      else await loadJournal();
    } finally {
      setOpening(false);
    }
  }, [loadJournal]);
  useEffect(() => {
    // Schedule bootstrap after mounting the initial shell; all restoration
    // failure/success updates belong to that asynchronous operation.
    void Promise.resolve().then(openApp);
    void initializeNotifications();
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        state === "background" &&
        getOnboardingSelections().privacy.biometricLockEnabled
      )
        setLocked(true);
    });
    return () => subscription.remove();
  }, [openApp]);

  return <View style={{ flex: 1 }}>
    {ready ? <View style={{ flex: 1 }} accessibilityElementsHidden={locked} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}>
      <LaunchRedirect guest={guest} entryChoiceMade={entryChoiceMade} />
      <Stack initialRouteName="index" screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="index" /><Stack.Screen name="onboarding" />
        <Stack.Protected guard={canOpenMainApp}>{MAIN_ROUTES.map(name => <Stack.Screen name={name} key={name} />)}</Stack.Protected>
        <Stack.Protected guard={guest && Boolean(completedAt)}><Stack.Screen name="sign-in" /></Stack.Protected>
        <Stack.Protected guard={guest}><Stack.Screen name="auth/callback" /></Stack.Protected>
      </Stack>
      {!locked ? <Companion /> : null}
    </View> : <View style={styles.lock}><ActivityIndicator color="#F4EFE6" accessibilityLabel="Opening your journal" /></View>}
    {loadError && !locked ? <View style={[StyleSheet.absoluteFill, styles.lock]}>
      <Text style={styles.lockTitle}>Your journal needs a moment.</Text>
      <Text style={styles.lockCopy}>{loadError === 'settings'
        ? 'We could not open your saved settings. Your journal and preferences have not been replaced. Try again when local storage is available.'
        : 'We could not open your saved entries. Nothing has been replaced. Try again to reconnect to your local journal.'}</Text>
      <PrimaryCTA label={opening ? 'Opening…' : 'Try opening again'} disabled={opening} onPress={() => { setOpening(true); void openApp(); }} />
    </View> : null}
    {locked ? <View style={[StyleSheet.absoluteFill, styles.lock]} accessibilityViewIsModal>
      <Text style={styles.lockTitle}>A space only you can open.</Text><Text style={styles.lockCopy}>{lockMessage}</Text>
      <PrimaryCTA label={unlocking ? 'Unlocking…' : 'Unlock your journal'} disabled={unlocking} onPress={() => void unlock()} />
    </View> : null}
  </View>;
}

function LaunchRedirect({ guest, entryChoiceMade }: { guest: boolean; entryChoiceMade: boolean }) {
  const { welcome } = useGlobalSearchParams<{ welcome?: string }>();
  const navigation = useRootNavigationState();
  const router = useRouter();
  const pathname = usePathname();
  const resolved = useRef(false);
  useEffect(() => {
    if (!navigation?.key || resolved.current) return;
    resolved.current = true;
    if (pathname === "/" && welcome === "1") return;
    const state = getOnboardingSelections();
    if (!guest && (pathname === '/sign-in' || pathname === '/auth/callback')) {
      router.replace((state.completedAt ? '/home' : resolveResumeRoute(state) ?? '/') as Href);
      return;
    }
    if (guest && pathname === "/sign-in" && entryChoiceMade && state.completedAt) { router.replace("/home"); return; }
    if (pathname !== "/") return;
    const target = state.completedAt ? (entryChoiceMade ? "/home" : "/sign-in") : resolveResumeRoute(state);
    if (target) router.replace(target as Href);
  }, [entryChoiceMade, guest, navigation?.key, pathname, router, welcome]);
  return null;
}
const styles = StyleSheet.create({
  fontHold: { flex: 1, backgroundColor: "#0B1D35" },
  lock: {
    backgroundColor: "#0B1D35",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 24,
    zIndex: 100,
  },
  lockTitle: {
    fontFamily: "CormorantGaramond_400Regular",
    fontSize: 34,
    color: "#F4EFE6",
    textAlign: "center",
  },
  lockCopy: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#C2C9D0",
    textAlign: "center",
    lineHeight: 23,
  },
});
