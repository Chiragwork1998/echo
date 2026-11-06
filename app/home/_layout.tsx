import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EchoBackground } from '@/components/EchoBackground';
import { plateColour } from '@/design/plateColour';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { HomeDissolveProvider } from '@/features/home/dissolve';
import { HomeTabBar } from '@/features/home/tabs/HomeTabBar';

// The one screen that wears another plate. Every other route here wears Home's, and the session
// sits transparently over the photograph drawn below.
const OTHER_PLATE: Record<string, string> = { complete: 'completion' };

/**
 * Today, Echoes, Patterns and You share one tab bar, drawn above the stack. It shows on those four
 * routes only, so Session and Completion, which sit in this stack, fill the screen.
 *
 * The Home photograph is also drawn once here, beneath the stack. The daily session draws its own
 * copy of it over a transparent screen, so when Home dissolves and the session takes its place the
 * mountains are always there, and cannot flash or shift (D-003). Every other screen covers it.
 */
export default function HomeLayout() {
  const { target, colors } = useTheme();
  const reduced = useReduceMotion();
  return (
    <HomeDissolveProvider>
      <View style={styles.root}>
        <EchoBackground screen="home" />
        <Stack
          screenOptions={({ route }) => ({
            headerShown: false,
            animation: 'fade',
            animationDuration: reduced ? tokens.motion.fast : tokens.motion.standard,
            contentStyle: {
              backgroundColor: plateColour(
                target,
                OTHER_PLATE[route.name] ?? 'home',
                colors.textInk,
              ),
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
        <HomeTabBar />
      </View>
    </HomeDissolveProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
