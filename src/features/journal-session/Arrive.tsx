import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

type Props = {
  ms?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  testID?: string;
  children: ReactNode;
};

/**
 * Something that appears because the state changed comes up from nothing instead of in one frame.
 * Opacity only; under Reduce Motion it is a plain fade of at most 180 ms, with no delay.
 */
export function Arrive({ ms = 600, delay = 0, style, pointerEvents, testID, children }: Props) {
  const reduced = useReduceMotion();
  const opacity = useSharedValue(0);
  useEffect(() => {
    const rise = withTiming(1, {
      duration: reduced ? tokens.motion.fast : ms,
      easing: EASE,
      reduceMotion: ReduceMotion.Never,
    });
    opacity.set(reduced || delay === 0 ? rise : withDelay(delay, rise));
  }, [delay, ms, opacity, reduced]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View pointerEvents={pointerEvents} testID={testID} style={[style, fade]}>
      {children}
    </Animated.View>
  );
}
