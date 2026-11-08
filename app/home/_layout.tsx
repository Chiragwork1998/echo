import { Stack, ThemeProvider } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { EchoBackground } from '@/components/EchoBackground';
import { BlurSurface } from '@/components/GlassCard';
import { CLEAR_NAVIGATOR, CLEAR_SCREEN } from '@/design/clearScreens';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { HomeDissolveProvider } from '@/features/home/dissolve';
import { NightHomeLoop } from '@/features/home/NightHomeLoop';
import { SESSION_ROUTE } from '@/features/home/sessionRoute';
import { readWelcomeCandidate } from '@/features/home/today/useStoneArrival';
import { HomeTabBar } from '@/features/home/tabs/HomeTabBar';
import { useGate } from '@/state/gate';

/**
 * Today, Echoes, Patterns and You share one tab bar, drawn above the stack. It shows on those four
 * routes only, so Session and Completion, which sit in this stack, fill the screen.
 *
 * The Home photograph is drawn once, here, beneath the stack, and both Home and the daily session
 * are transparent over it. So when Home dissolves and the session takes its place nothing about the
 * mountains changes: not a pixel shifts, and the loop that makes Night's river flow (D-009) is the
 * same video on the same surface all the way through, with nothing to restart. It is also the one
 * target the glass above blurs on Android. Every other screen covers it with a plate of its own.
 */
export default function HomeLayout() {
  const reduced = useReduceMotion();
  // The lock panel is opaque and sits above everything: nothing should play behind it.
  const locked = useGate((state) => state.lock.kind === 'locked');
  // Home's first look after onboarding wakes the river slowly. Decided as Home first appears.
  const [welcome] = useState(readWelcomeCandidate);
  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: reduced ? tokens.motion.fast : tokens.motion.standard,
        // Every screen is clear. Home and the session draw no photograph and show the one beneath the
        // stack. The screens that wear a plate of their own, Completion above all, draw it above the
        // plate backing, which is what shows until it is drawn.
        contentStyle: CLEAR_SCREEN,
      }}
    >
      {/* Reached by dissolve, so Home has already melted when it arrives; its fade out is the stack's
          own, so the book goes gently (src/features/home/sessionRoute.ts). */}
      <Stack.Screen name="session" options={SESSION_ROUTE} />
      {/* Breathe is reached the same way, and breathes over the same plate. */}
      <Stack.Screen
        name="breathe"
        options={{ animation: 'none', gestureEnabled: false, contentStyle: CLEAR_SCREEN }}
      />
      {/* Rehearse fades in over the session it follows, onto the same plate. */}
      <Stack.Screen
        name="rehearse"
        options={{ gestureEnabled: false, contentStyle: CLEAR_SCREEN }}
      />
    </Stack>
  );
  return (
    <HomeDissolveProvider>
      <View style={styles.root}>
        <BlurSurface
          backdrop={
            <EchoBackground
              screen="home"
              overlay={<NightHomeLoop suspended={locked} welcome={welcome} />}
            />
          }
        >
          {Platform.OS === 'web' ? (
            <ThemeProvider value={CLEAR_NAVIGATOR}>{stack}</ThemeProvider>
          ) : (
            stack
          )}
          <HomeTabBar />
        </BlurSurface>
      </View>
    </HomeDissolveProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
