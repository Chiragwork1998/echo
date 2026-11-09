import { router, Stack } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { tokens } from '@/design/tokens';
import { useHomeDissolve } from '@/features/home/dissolve';
import { CompletionArrival } from '@/features/onboarding/completion/CompletionArrival';
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

/**
 * Home's interface is given back behind the card once the card has been on show this long: after its
 * own fade in and the dissolve of its plate over the one that was there (320 ms each), so that Home's
 * interface is never what is seen through a card that is still arriving.
 */
const HOME_BACK_AFTER_MS = tokens.motion.screen;

/**
 * The same plate and card after a daily session, without onboarding's progress. Returns to Home.
 * The swipe-back gesture is off because the session behind it has already been committed.
 *
 * Home's interface is given back while this card is on show, not once the session has been unmounted
 * (which is after the pop, on a busy JS thread). Left to that, Enter your space cut to the bare
 * photograph and Home's interface came in 0.6 s later, as a beat of its own. Given back behind the
 * card, it is already there when the card goes, and arrives with its photograph. If the person leaves
 * sooner than that, it is given back at once.
 */
export function DailyCompletionScreen() {
  const { returnHome } = useHomeDissolve();
  useEffect(() => {
    const timer = setTimeout(returnHome, HOME_BACK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [returnHome]);

  // The daily session is still in the stack under this screen, and Home's dissolve is only undone when it
  // unmounts. Popping to the Home beneath closes both: `replace` left the session mounted behind a Home
  // that stayed the bare photograph.
  const goHome = useCallback(() => {
    returnHome();
    router.dismissTo(HOME_PATH as never);
    return true;
  }, [returnHome]);

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <CompletionArrival>
        <CompletionView mode="daily" onEnter={goHome} />
      </CompletionArrival>
    </>
  );
}
