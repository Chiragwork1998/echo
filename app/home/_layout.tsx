import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { EchoBackground } from '@/components/EchoBackground';
import { BlurSurface } from '@/components/GlassCard';
import { plateColour } from '@/design/plateColour';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { HomeDissolveProvider } from '@/features/home/dissolve';
import { NightHomeLoop } from '@/features/home/NightHomeLoop';
import { HomeTabBar } from '@/features/home/tabs/HomeTabBar';
import { useGate } from '@/state/gate';

// The one screen that wears another plate. Echoes, Patterns and You wear Home's own copy, and
// Home and the session are transparent over the photograph drawn below.
const OTHER_PLATE: Record<string, string> = { complete: 'completion' };
/** Home itself: it draws no photograph, so the one beneath the stack shows through. */
const TRANSPARENT_ROUTES: readonly string[] = ['index'];
/**
 * The web navigator paints its theme's background over everything beneath it, so the visual harness
 * would compare Home against a white page. Native honours contentStyle and needs none of this.
 */
const CLEAR_NAVIGATOR = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

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
  const { target, colors } = useTheme();
  const reduced = useReduceMotion();
  // The lock panel is opaque and sits above everything: nothing should play behind it.
  const locked = useGate((state) => state.lock.kind === 'locked');
  const stack = (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        animationDuration: reduced ? tokens.motion.fast : tokens.motion.standard,
        contentStyle: {
          backgroundColor: TRANSPARENT_ROUTES.includes(route.name)
            ? 'transparent'
            : plateColour(target, OTHER_PLATE[route.name] ?? 'home', colors.textInk),
        },
      })}
    >
      {/* Reached by dissolve, so it swaps in with no animation and no screen colour of its own. */}
      <Stack.Screen
        name="session"
        options={{
          animation: 'none',
          gestureEnabled: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
  return (
    <HomeDissolveProvider>
      <View style={styles.root}>
        <BlurSurface
          backdrop={<EchoBackground screen="home" overlay={<NightHomeLoop suspended={locked} />} />}
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
