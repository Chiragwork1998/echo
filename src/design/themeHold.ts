import { create } from 'zustand';

const useHolds = create<{ holds: number }>(() => ({ holds: 0 }));

/** True while something has asked for the theme to stay as it is. */
export const useThemeHeld = () => useHolds((state) => state.holds > 0);

/**
 * Keeps the theme as it is until the returned function is called. The theme must never change in
 * the middle of an active writing session, whether the person chose it or the phone's appearance
 * changed, so the session holds it while it is on screen. The change that was waiting is made when
 * the last hold is released. Calling the release twice is harmless.
 */
export function holdTheme(): () => void {
  useHolds.setState((state) => ({ holds: state.holds + 1 }));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    useHolds.setState((state) => ({ holds: Math.max(0, state.holds - 1) }));
  };
}
