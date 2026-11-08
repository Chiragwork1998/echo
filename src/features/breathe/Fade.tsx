import { useEffect } from 'react';
import type { ViewProps } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

/** Something that is on the sky comes in over this long, and goes out a little quicker. */
export const FADE = { in: 520, out: 320 } as const;

type Props = ViewProps & {
  /** False fades it out. It stays in the tree: the caller takes it away once it has faded. */
  visible?: boolean;
  inMs?: number;
  outMs?: number;
};

/**
 * A view that comes up from nothing and goes back to nothing, instead of appearing whole. Opacity
 * only. Reduce Motion: a plain fade of 180 ms either way.
 */
export function Fade({
  visible = true,
  inMs = FADE.in,
  outMs = FADE.out,
  style,
  children,
  ...rest
}: Props) {
  const reduced = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: reduced ? tokens.motion.fast : visible ? inMs : outMs,
        easing: visible ? EASE : Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [inMs, outMs, reduced, shown, visible]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View {...rest} style={[style, fade]}>
      {children}
    </Animated.View>
  );
}
