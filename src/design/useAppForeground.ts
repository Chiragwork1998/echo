import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// AppState.currentState is null until the system first answers, so only a clear "away" counts.
const isAway = (state: unknown) => state === 'background' || state === 'inactive';

/** True while the app is in the foreground. Inactive counts as away: the app switcher is open. */
export function useAppForeground(): boolean {
  const [active, setActive] = useState(!isAway(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setActive(!isAway(next)));
    return () => subscription.remove();
  }, []);
  return active;
}
