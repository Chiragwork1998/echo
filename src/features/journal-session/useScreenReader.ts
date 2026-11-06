import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { qa } from '@/testing/qa';

/**
 * Live: whether VoiceOver or TalkBack is running. Nothing hidden should depend on timing then.
 * React Native Web claims a screen reader is always on, so the visual harness decides for itself:
 * off, unless a script sets window.__echoScreenReader.
 */
export function useScreenReader() {
  const [on, setOn] = useState(
    () => qa.enabled && (window as { __echoScreenReader?: boolean }).__echoScreenReader === true,
  );
  useEffect(() => {
    if (qa.enabled) return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => live && setOn(enabled));
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return on;
}
