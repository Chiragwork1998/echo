import { Stack } from 'expo-router';

import { CLEAR_SCREEN } from '@/design/clearScreens';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

/**
 * Onboarding's screens dissolve into one another over 650 ms, forward and back, and each plate
 * scales as it does (EchoBackground). Every screen is clear: beneath the whole navigator lies the
 * plate that was last on show (PlateBacking), so that nothing between two screens, in either theme,
 * is ever a flat colour, white or blank, however long the next screen's photograph takes to draw.
 * Reduce Motion keeps the dissolve and shortens it to 180 ms.
 */
export default function OnboardingLayout() {
  const reduced = useReduceMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        animationDuration: reduced ? tokens.motion.fast : tokens.motion.screen,
        contentStyle: CLEAR_SCREEN,
      }}
    >
      {/* The first entry is committed by this point, so there is no going back into the flow. */}
      <Stack.Screen name="completion" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
