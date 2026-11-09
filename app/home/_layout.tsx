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
import { overHome, SESSION_ROUTE } from '@/features/home/sessionRoute';
import { readWelcomeCandidate } from '@/features/home/today/useStoneArrival';
import { HomeTabBar, HomeTabBarProvider } from '@/features/home/tabs/HomeTabBar';
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
  // Home's first look after onboarding wakes the river slowly. Decided as Home first appears. It is
  // also the hand-over from Completion, which has let its interface go over its own photograph: Home's
  // photograph comes up over that one, and Home's interface then rises (HomeScreen says when), so that
  // nothing is cut and no frame is a photograph that does not belong to what follows.
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
      <Stack.Screen name="session" options={{ ...SESSION_ROUTE, ...overHome() }} />
      {/* Breathe is reached the same way, and breathes over the same plate. Presented over Home too, so
          that Home stays up beneath it and the session it opens, and is there when Completion goes. Its
          own coming and going is a cut: what moves on it moves by its own animation. */}
      <Stack.Screen
        name="breathe"
        options={{
          animation: 'none',
          gestureEnabled: false,
          contentStyle: CLEAR_SCREEN,
          ...overHome(),
        }}
      />
      {/* Rehearse fades in over the session it follows, onto the same plate. */}
      <Stack.Screen
        name="rehearse"
        options={{ gestureEnabled: false, contentStyle: CLEAR_SCREEN, ...overHome() }}
      />
      {/* Completion follows the session, and Enter your space goes back through it to Home. Presented
          over Home like the session, so that Home's interface is there when its card goes. */}
      <Stack.Screen name="complete" options={{ contentStyle: CLEAR_SCREEN, ...overHome() }} />
      {/* The other tabs, each pushed over Today once and replaced by the next (goToTab). Presented over
          Home, so that Home stays up beneath them and Today is a pop onto a Home that was never taken
          down. Each draws a plate of its own over the whole screen (TabPage), so Home is not seen. The
          entry page stays a plain screen. */}
      <Stack.Screen name="echoes" options={overHome()} />
      <Stack.Screen name="patterns" options={overHome()} />
      <Stack.Screen name="you" options={overHome()} />
    </Stack>
  );
  return (
    <HomeDissolveProvider veiled={welcome}>
      {/* Completion, in the stack, brings the bar in as its own fade ends (useRevealTabBar). */}
      <HomeTabBarProvider>
        <View style={styles.root}>
          <BlurSurface
            backdrop={
              <EchoBackground
                screen="home"
                comesUp={welcome}
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
      </HomeTabBarProvider>
    </HomeDissolveProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
