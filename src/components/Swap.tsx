import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

const SWAP_MS = 200;

type Held = { key: string | number; node: ReactNode };

/**
 * One thing a card can be about. It fades in when it arrives in place of another, fades out when it
 * is replaced, and is the same instance throughout: what it holds is never torn down and drawn again
 * (an image would flash) as it changes from the one to the other.
 */
function Layer({
  arriving,
  leaving,
  children,
}: PropsWithChildren<{ arriving: boolean; leaving: boolean }>) {
  const reduced = useReduceMotion();
  const [startsAt] = useState(arriving ? 0 : 1);
  const shown = useSharedValue(startsAt);
  const target = leaving ? 0 : 1;
  useEffect(() => {
    if (shown.get() === target) return;
    shown.set(
      withTiming(target, {
        duration: reduced ? tokens.motion.fast : SWAP_MS,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [reduced, shown, target]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      style={[leaving && styles.leaving, style]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * What is written on a card that comes to be about something else: a draft turns up where the last
 * echo was, a reading replaces another. The words are not cut over, and the card does not fade (its
 * glass must stay whole): the old fades out in its place as the new fades in, in 200 ms. `contentKey`
 * says what the card is about; the same key with different words is the same thing, changed, and
 * simply follows. For a card on a screen that settled before its answer did, so that a card showing
 * what it knew is not seen to change its mind part of the way through arriving.
 */
export function Swap({ contentKey, children }: PropsWithChildren<{ contentKey: string | number }>) {
  const reduced = useReduceMotion();
  // What is shown now, kept up to date while its key holds, and what it replaced while that fades.
  const [now, setNow] = useState<Held>({ key: contentKey, node: children });
  const [before, setBefore] = useState<Held[]>([]);
  if (now.key !== contentKey) {
    setBefore((held) => [...held.filter(({ key }) => key !== contentKey), now]);
    setNow({ key: contentKey, node: children });
  } else if (now.node !== children) {
    setNow({ key: contentKey, node: children });
  }
  // Changed again before the last had gone: all of them go together, a little after the last change.
  const swapping = before.length > 0;
  useEffect(() => {
    if (!swapping) return;
    const over = setTimeout(() => setBefore([]), (reduced ? tokens.motion.fast : SWAP_MS) + 40);
    return () => clearTimeout(over);
  }, [before, reduced, swapping]);

  // One list, each by its own key, so that the one that was in place is the one that fades away.
  const here = before.filter(({ key }) => key !== contentKey);
  return (
    <View>
      {[...here, now].map(({ key, node }) => {
        const leaving = key !== contentKey;
        return (
          <Layer key={key} arriving={!leaving && swapping} leaving={leaving}>
            {leaving ? node : children}
          </Layer>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
});
