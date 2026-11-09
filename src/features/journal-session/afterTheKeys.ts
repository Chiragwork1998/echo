import { Keyboard, type EmitterSubscription } from 'react-native';

/** The longest anything waits for the keys to go. They take about a quarter of a second. */
export const KEYS_AWAY_CAP_MS = 500;

/**
 * Lets go of the keyboard, and runs `then` once it has gone, or at once when none is up. Returns a
 * way to call it off (nothing runs), or null when `then` has already run.
 *
 * The screen beneath puts the keys away itself, so that its own window runs the keyboard's going: a
 * sheet raised with the keys up takes the focus, and the keys vanish under it in one frame, which the
 * screen never sees (Reanimated goes on holding them open at their height). If the keys do not say they
 * have gone within `cap`, `then` runs anyway.
 */
export function afterTheKeys(then: () => void, cap = KEYS_AWAY_CAP_MS): (() => void) | null {
  if (!Keyboard.isVisible()) {
    then();
    return null;
  }
  let waiting = true;
  let hidden: EmitterSubscription | undefined;
  let late: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    waiting = false;
    hidden?.remove();
    clearTimeout(late);
  };
  const go = () => {
    if (!waiting) return;
    stop();
    then();
  };
  hidden = Keyboard.addListener('keyboardDidHide', go);
  late = setTimeout(go, cap);
  Keyboard.dismiss();
  return stop;
}
