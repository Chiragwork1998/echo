import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** The tag a practice holds the screen under, apart from the journal's own (useKeepAwake.ts). */
export const BREATH_KEEP_AWAKE_TAG = 'echo-breathe';

// AppState.currentState is null until the system first answers, so only a clear "away" counts.
const isAway = (state: unknown) => state === 'background' || state === 'inactive';

/**
 * Keeps the screen on while a practice runs, as useKeepAwake.ts does for a take: a person breathing
 * with their eyes closed does not touch the phone, and it must not sleep under them. Lets go when
 * `on` turns false, when the screen unmounts, and when the app leaves the foreground.
 */
export function useBreathAwake(on: boolean) {
  const [foreground, setForeground] = useState(!isAway(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) =>
      setForeground(!isAway(next)),
    );
    return () => subscription.remove();
  }, []);

  const held = on && foreground;
  useEffect(() => {
    if (!held) return;
    void activateKeepAwakeAsync(BREATH_KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(BREATH_KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [held]);
}
