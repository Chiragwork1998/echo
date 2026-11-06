import { Stack } from 'expo-router';

import { plateColour } from '@/design/plateColour';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

/**
 * Onboarding's screens dissolve into one another over 650 ms, forward and back, and each plate
 * scales as it does (EchoBackground). Behind every screen sits its own plate's dominant colour, so
 * that nothing between two screens, in either theme, is ever white or blank. Reduce Motion keeps the
 * dissolve and shortens it to 180 ms.
 */
export default function OnboardingLayout() {
  const { target, colors } = useTheme();
  const reduced = useReduceMotion();
  return (
    <Stack
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        animationDuration: reduced ? tokens.motion.fast : tokens.motion.screen,
        contentStyle: { backgroundColor: plateColour(target, route.name, colors.textInk) },
      })}
    >
      {/* The first entry is committed by this point, so there is no going back into the flow. */}
      <Stack.Screen name="completion" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
