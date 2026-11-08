import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';

import { EchoText } from '@/components/EchoText';
import { EchoWordmark } from '@/components/EchoWordmark';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ToastHost } from '@/components/Toast';
import { fontMap } from '@/design/fonts';
import { plateColour } from '@/design/plateColour';
import { setPlateFlowStep } from '@/design/plateMotion';
import { PLATE_WAIT_MS, usePlatesPending } from '@/design/platePaint';
import { ThemeProvider, useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { DialogHost, showDialog } from '@/features/tab-pages/Dialog';
import { deleteAllLocal } from '@/services/deleteAllLocal';
import { loadScreenCapture } from '@/services/nativeModules';
import { startPlus } from '@/services/plus/engine';
import { shouldOfferPlus, usePlusStore } from '@/services/plus/store';
import {
  bootApp,
  disableLock,
  gateBypassed,
  handleAppState,
  unlock,
  useGate,
  type GateStatus,
  type LockStatus,
} from '@/state/gate';
import { gateCopy } from '@/state/gateCopy';
import { endLaunch, resetLaunch, useLaunch } from '@/state/launch';
import { completeOnboarding, setOnboardingStep, useOnboarding } from '@/state/onboarding';
import { ownWindowOpen } from '@/state/ownWindows';
import { decideRoute, stepForPath } from '@/state/routing';
import { goldenFixtures } from '@/testing/goldenFixtures';
import { qa } from '@/testing/qa';

SplashScreen.preventAutoHideAsync();

if (qa.fixture) useOnboarding.setState(goldenFixtures[qa.fixture] ?? {});

const referenceInsets = { top: 59, bottom: 34, left: 0, right: 0 };
const PANEL_INSET = tokens.space['24'];
const PANEL_GAP = tokens.space['16'];
/** A splash that never lifts would lock someone out as surely as a lost key. */
const SPLASH_LIMIT_MS = 3000;
const SECURE_WINDOW_KEY = 'echo-lock';

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

// The plate each top-level route opens on, for the colour behind it. Onboarding opens on Intent, and
// ECHO Plus sits over Home's plate.
const ROOT_PLATE: Record<string, string> = {
  index: 'landing',
  onboarding: 'intent',
  home: 'home',
  plus: 'home',
};

function Navigator({ resume, onSettled }: { resume: string; onSettled: () => void }) {
  const { target, colors } = useTheme();
  const reduced = useReduceMotion();
  const pathname = usePathname();
  const completed = useOnboarding((state) => state.completedAt !== undefined);
  const offerPlus = usePlusStore(shouldOfferPlus);
  // True until this launch has decided where it is going. Nothing animates to that place: the splash
  // is still over the screen, and the place it is sent from is not one to show (see useLanding).
  const launching = useLaunch((state) => !state.over && !gateBypassed);

  // A navigator that goes away (the gate resolving again) leaves the next one a fresh launch.
  useEffect(() => resetLaunch, []);

  // Plates scale as the journey moves (see plateMotion), so they need to know where it is.
  useEffect(() => setPlateFlowStep(stepForPath(pathname)), [pathname]);

  // Runs on every route change, so that it holds for deep links and the system back button as well
  // as for launch. Screens that follow the flow are never redirected.
  useEffect(() => {
    if (gateBypassed) return;
    const decision = decideRoute({
      pathname,
      completed,
      step: useOnboarding.getState().step,
      resume,
      initial: !useLaunch.getState().over,
      offerPlus,
    });
    if (decision.action === 'replace') {
      router.replace(decision.path as never);
      return;
    }
    if (decision.action === 'complete') void completeOnboarding();
    endLaunch();
    onSettled();
    const step = stepForPath(pathname);
    if (step !== null) setOnboardingStep(step);
  }, [completed, offerPlus, onSettled, pathname, resume]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={({ route }) => ({
          headerShown: false,
          animation: launching ? 'none' : 'fade',
          animationDuration: reduced ? tokens.motion.fast : tokens.motion.screen,
          // Behind each screen sits its own plate's dominant colour: never white, never blank.
          contentStyle: {
            backgroundColor: plateColour(target, ROOT_PLATE[route.name] ?? '', colors.textInk),
          },
        })}
      />
    </>
  );
}

/** A full-screen state of the gate. Plain on purpose: these moments have no golden. */
function GatePanel(props: PropsWithChildren<{ title: string; body: string }>) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: colors.textInk }]}>
      <View style={styles.message}>
        <EchoWordmark />
        <EchoText variant="displayM" align="center" accessibilityRole="header">
          {props.title}
        </EchoText>
        <EchoText variant="bodyM" align="center" color="textSecondary">
          {props.body}
        </EchoText>
      </View>
      <View style={styles.actions}>{props.children}</View>
    </View>
  );
}

function confirmStartOver() {
  const { confirmTitle, confirmBody, confirmCancel, confirmErase } = gateCopy.keyLost;
  showDialog(confirmTitle, confirmBody, [
    { text: confirmCancel, style: 'cancel' },
    { text: confirmErase, style: 'destructive', onPress: () => void deleteAllLocal() },
  ]);
}

function KeyLostPanel() {
  const { title, body, retry, startOver } = gateCopy.keyLost;
  return (
    <GatePanel title={title} body={body}>
      <PrimaryCTA label={retry} onPress={() => void bootApp()} />
      <PrimaryCTA label={startOver} variant="glass" onPress={confirmStartOver} />
    </GatePanel>
  );
}

function StoragePanel({ reason }: { reason: keyof typeof storageCopy }) {
  const { title, body } = storageCopy[reason];
  return (
    <GatePanel title={title} body={body}>
      <PrimaryCTA label={gateCopy.storage.retry} onPress={() => void bootApp()} />
    </GatePanel>
  );
}

const storageCopy = {
  secure_store: gateCopy.storage.secure_store,
  database: gateCopy.storage.database,
  database_too_new: gateCopy.storage.database_too_new,
};

function lockMessage(lock: Extract<LockStatus, { kind: 'locked' }>): string {
  const { none, failed, lockout, biometric, passcode } = gateCopy.lock;
  if (lock.method === 'none') return none;
  if (lock.failure === 'lockout') return lockout;
  if (lock.failure === 'failed' || lock.failure === 'system') return failed;
  return lock.method === 'biometric' ? biometric : passcode;
}

/** Sits over the mounted navigator, so a re-lock never disturbs what the user was writing. */
function LockPanel({ lock, covered }: { lock: LockStatus; covered: boolean }) {
  const locked = lock.kind === 'locked';
  const promptable = locked && lock.method !== 'none' && lock.failure === null;

  // Prompts once for each lock, and only in the foreground. After that it waits for a tap, because
  // re-prompting on failure would trap the user in a loop.
  useEffect(() => {
    if (promptable && !covered) void unlock();
  }, [covered, promptable]);

  if (!locked) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <GatePanel title={gateCopy.lock.title} body={lockMessage(lock)}>
        {lock.method !== 'none' ? (
          <PrimaryCTA label={gateCopy.lock.unlock} onPress={() => void unlock()} />
        ) : null}
        {lock.canDisable ? (
          <PrimaryCTA
            label={gateCopy.lock.disable}
            variant="glass"
            onPress={() => void disableLock()}
          />
        ) : null}
      </GatePanel>
    </View>
  );
}

/** True whenever the app is not in the foreground, including while the app switcher is open. */
function useAppCovered(): boolean {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    if (gateBypassed) return;
    const subscriptions = [
      AppState.addEventListener('change', (next) => {
        handleAppState(next);
        setCovered(next !== 'active');
      }),
      // Android only. Fires as recents opens, ahead of the pause that 'change' reports. It fires
      // too as each of ECHO's own sheets and dialogs takes the window's focus, and those are no
      // reason to hide the page they sit over.
      AppState.addEventListener('blur', () => {
        if (!ownWindowOpen()) setCovered(true);
      }),
      AppState.addEventListener('focus', () => setCovered(AppState.currentState !== 'active')),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  return covered;
}

/**
 * Android's recents thumbnail races PrivacyCover, so with the lock on the window is marked secure
 * instead, and the thumbnail is blank. That also blocks screenshots and screen recording while the
 * app is open, which is why it follows the lock and nothing changes with the lock off.
 */
function useSecureWindowWhileLocked() {
  const lockEnabled = useOnboarding((state) => state.privacy.biometricLock);
  useEffect(() => {
    if (gateBypassed || Platform.OS !== 'android' || !lockEnabled) return;
    // PrivacyCover still stands if this fails, and a failed flag must not stop anyone writing. It
    // throws outright on a build made before the native module was added.
    try {
      const { preventScreenCaptureAsync, allowScreenCaptureAsync } = loadScreenCapture();
      preventScreenCaptureAsync(SECURE_WINDOW_KEY).catch(() => undefined);
      return () => {
        allowScreenCaptureAsync(SECURE_WINDOW_KEY).catch(() => undefined);
      };
    } catch {
      return;
    }
  }, [lockEnabled]);
}

/**
 * Hides content from the app switcher. iOS takes its snapshot after 'inactive', so this reliably wins
 * there. Android's thumbnail races this render, so there it is best effort unless the lock is on:
 * see useSecureWindowWhileLocked.
 */
function PrivacyCover() {
  const { colors } = useTheme();
  return (
    <View style={[styles.cover, { backgroundColor: colors.textInk }]}>
      <EchoWordmark />
    </View>
  );
}

function Content({ status, onSettled }: { status: GateStatus; onSettled: () => void }) {
  const lock = useGate((state) => state.lock);
  const covered = useAppCovered();
  const hidden = covered || lock.kind === 'locked';
  useSecureWindowWhileLocked();

  return (
    <View style={styles.root}>
      <View
        style={styles.root}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      >
        {status.kind === 'ready' ? (
          <>
            <Navigator resume={status.resume} onSettled={onSettled} />
            {/* Here, so that a lock or the app switcher hides it from screen readers too. */}
            <ToastHost />
          </>
        ) : null}
        {/* Beside the toast, but outside the navigator's branch: Start over asks from the key-lost
            panel. Its window would sit above the lock, so the lock holds it until unlocked. */}
        <DialogHost held={lock.kind === 'locked'} />
      </View>
      {status.kind === 'key_lost' ? <KeyLostPanel /> : null}
      {status.kind === 'storage_error' ? <StoragePanel reason={status.reason} /> : null}
      <LockPanel lock={lock} covered={covered} />
      {covered ? <PrivacyCover /> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  const fontsReady = fontsLoaded || fontError !== null;
  const status = useGate((state) => state.status);
  const [settled, setSettled] = useState(gateBypassed);
  const resolved = status.kind === 'ready' ? settled : status.kind !== 'booting';
  const onSettled = useCallback(() => setSettled(true), []);
  const platesPending = usePlatesPending();
  const [plateWaitOver, setPlateWaitOver] = useState(false);
  const splashHidden = useRef(false);

  useEffect(() => {
    void bootApp();
    void startPlus();
  }, []);

  useEffect(() => {
    if (status.kind !== 'ready' || settled) return;
    const timer = setTimeout(onSettled, SPLASH_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [onSettled, settled, status.kind]);

  // A plate that is still being decoded does not hold it for long: a launch is never held by an image.
  useEffect(() => {
    if (!resolved) return;
    const timer = setTimeout(() => setPlateWaitOver(true), PLATE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [resolved]);

  // The splash stays until the first real screen is in place and its photograph is drawn, so nothing
  // flashes on the way there: not a screen that is being left, and not a flat colour waiting for the
  // plate.
  useEffect(() => {
    if (splashHidden.current || !fontsReady || !resolved) return;
    if (platesPending && !plateWaitOver) return;
    splashHidden.current = true;
    SplashScreen.hideAsync();
  }, [fontsReady, platesPending, plateWaitOver, resolved]);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeArea>
        <ThemeProvider>
          <Content status={status} onSettled={onSettled} />
        </ThemeProvider>
      </SafeArea>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: { ...StyleSheet.absoluteFill, justifyContent: 'center', paddingHorizontal: PANEL_INSET },
  message: { alignItems: 'center', gap: PANEL_GAP },
  actions: { alignItems: 'center', gap: PANEL_GAP, marginTop: PANEL_INSET },
  cover: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
