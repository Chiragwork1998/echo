import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      {/* The first entry is committed by this point, so there is no going back into the flow. */}
      <Stack.Screen name="completion" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
