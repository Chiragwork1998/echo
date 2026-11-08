import type { PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';

import { useBeat } from './useBeat';

/**
 * Words that are leaving hold on a moment and then go, and the words that arrive decelerate into
 * their place: one hands the line to the other, and there is never a moment of nothing between.
 */
const LEAVE = Easing.in(Easing.quad);

type Props = PropsWithChildren<{
  /** When the fade begins, and how long it takes. */
  at: number;
  ms: number;
  /** Opacity at the start and at the end. */
  from: number;
  to: number;
  /** Laid over its sibling, not beside it: the words that are leaving. Hidden from screen readers. */
  leaving?: boolean;
  /** The curve of the fade. Leaving words accelerate away and arriving words decelerate. */
  easing?: EasingFunction | EasingFunctionFactory;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Words giving way to other words: opacity only, nothing moves. A pair of these, one fading out
 * and one fading in over the same place, is the whole of a crossfade.
 */
export function FadeLayer({ at, ms, from, to, leaving = false, easing, style, children }: Props) {
  const beat = useBeat(at, ms, 0, easing ?? (leaving ? LEAVE : EASE));
  const fade = useAnimatedStyle(() => ({ opacity: from + (to - from) * beat.get() }));
  return (
    <Animated.View
      style={[leaving && StyleSheet.absoluteFill, style, fade]}
      pointerEvents="none"
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
    >
      {children}
    </Animated.View>
  );
}
