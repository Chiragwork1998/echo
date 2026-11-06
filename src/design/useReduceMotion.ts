import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/** Live Reduce Motion. Reanimated's own hook is read once at launch, so looping motion needs this. */
export function useReduceMotion() {
  const [reduced, setReduced] = useState(useReducedMotion());

  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);

  return reduced;
}
