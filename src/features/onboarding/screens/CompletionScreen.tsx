import { router, Stack } from 'expo-router';

import { CompletionView } from '@/features/onboarding/completion/CompletionView';
import { completeOnboarding } from '@/state/onboarding';
import { HOME_PATH } from '@/state/routing';

/**
 * Onboarding step 8. Enter your space makes onboarding durable and does not navigate: the root
 * layout moves to Home once it is saved. The entry was committed before this screen appeared.
 */
export function CompletionScreen() {
  return <CompletionView mode="onboarding" onEnter={completeOnboarding} />;
}

// The daily session is still in the stack under this screen, and Home's dissolve is only undone when it
// unmounts. Popping to the Home beneath closes both: `replace` left the session mounted behind a Home
// that stayed the bare photograph.
const goHome = () => {
  router.dismissTo(HOME_PATH as never);
  return true;
};

/**
 * The same plate and card after a daily session, without onboarding's progress. Returns to Home.
 * The swipe-back gesture is off because the session behind it has already been committed.
 */
export function DailyCompletionScreen() {
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <CompletionView mode="daily" onEnter={goHome} />
    </>
  );
}
