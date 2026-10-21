import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

import { tokens } from './tokens';

/** Tracks the OS Reduce Motion setting; safe to call from several components. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setReduceMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

type PressScale = {
  /** Attach to the animated wrapper that carries the control surface. */
  animatedStyle: { transform: { scale: Animated.Value }[] };
  onPressIn: () => void;
  onPressOut: () => void;
  /** True while held, so a surface can drop 20% of its shadow. */
  pressed: boolean;
};

/**
 * Tactile press feedback shared by every control: 180 ms scale to 0.985, and
 * opacity-only when Reduce Motion is on (`specs/INTERACTIONS_AND_STATES.md`).
 */
export function usePressScale(scale: number = tokens.control.pressScale): PressScale {
  const reduceMotion = useReduceMotion();
  const [value] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);

  const animate = useCallback(
    (toValue: number) => {
      if (reduceMotion) {
        value.setValue(1);
        return;
      }
      Animated.timing(value, {
        duration: tokens.control.pressDuration,
        easing: Easing.out(Easing.quad),
        toValue,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    },
    [reduceMotion, value],
  );

  return {
    animatedStyle: { transform: [{ scale: value }] },
    onPressIn: useCallback(() => {
      setPressed(true);
      animate(scale);
    }, [animate, scale]),
    onPressOut: useCallback(() => {
      setPressed(false);
      animate(1);
    }, [animate]),
    pressed,
  };
}
