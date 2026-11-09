import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { useUiBegun, watchAnimation, type Watch } from '@/features/book/animationEnd';
import { useHomeDissolve } from '@/features/home/dissolve';
import { useRevealTabBar } from '@/features/home/tabs/HomeTabBar';
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
 *
 * Enter your space, and Back, let the screen go by its own fade before it is popped, as the daily
 * session's page does: the stack's own fade is not seen on every phone (the walked emulator popped it
 * in a frame or two), and the route that pops it changed before it had gone, with the tab bar, which is
 * drawn above the stack, already over the card. The fade reveals Home, whole beneath it; the bar comes
 * as the fade ends; and the screen is popped once the fade has ended on the UI thread, never by a clock.
 */
export function DailyCompletionScreen() {
  const { returnHome } = useHomeDissolve();
  const revealTabBar = useRevealTabBar();
  const reduced = useReduceMotion();
  useEffect(() => {
    const timer = setTimeout(returnHome, HOME_BACK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [returnHome]);

  const gone = useSharedValue(0);
  const [leaving, setLeaving] = useState(false);
  const exit = useRef<Watch | null>(null);
  const uiBegun = useUiBegun();
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
      exit.current?.cancel();
    };
  }, []);

  // The daily session is still in the stack under this screen, and Home's dissolve is only undone when it
  // unmounts. Popping to the Home beneath closes both: `replace` left the session mounted behind a Home
  // that stayed the bare photograph.
  const goHome = useCallback(() => {
    returnHome();
    if (exit.current) return true;
    setLeaving(true);
    const duration = reduced ? tokens.motion.fast : tokens.motion.standard;
    const watch = watchAnimation(duration, () => {
      if (here.current) router.dismissTo(HOME_PATH as never);
    });
    exit.current = watch;
    const { ended } = watch;
    const faded = () => {
      'worklet';
      runOnJS(ended)();
    };
    gone.set(
      withTiming(
        1,
        { duration, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never },
        faded,
      ),
    );
    uiBegun(watch.began);
    revealTabBar(duration);
    return true;
  }, [gone, reduced, returnHome, revealTabBar, uiBegun]);
  const fade = useAnimatedStyle(() => ({ opacity: 1 - gone.get() }));

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Animated.View
        testID="completion-exit"
        style={[styles.fill, fade]}
        pointerEvents={leaving ? 'none' : 'auto'}
      >
        <CompletionView mode="daily" onEnter={goHome} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
