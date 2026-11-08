import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';

import type { ScreenId } from '@/features/onboarding/flow';

import type { ThemeName } from './tokens';

/**
 * What the plates know about one another. A plate is a large photograph that is decoded when its
 * screen mounts, which can take well over a frame. Two things follow from that, and both live here:
 *
 * - The splash waits for the plate of the first screen, so a launch never goes from the splash to a
 *   flat colour (see usePlatesPending and app/_layout).
 * - A plate that arrives on a new screen knows which plate was last on show, and holds it up until
 *   its own is drawn (see EchoBackground), so a screen change never shows a flat colour either.
 */

/** The longest a plate that has not come up may hold the splash. */
export const PLATE_WAIT_MS = 1500;
/**
 * A plate that is drawn within this long of its screen mounting was already to hand, and replaces
 * the one beneath it at once, as it always did. One that takes longer comes up over it, softly.
 */
export const PLATE_LATE_MS = 80;

let pending = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** True while any plate that has mounted has not yet been drawn. */
export function usePlatesPending(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pending > 0,
    () => false,
  );
}

/**
 * Called by a plate as it mounts: it is awaited until the returned function is called, or until it
 * unmounts. Registered before paint, in the commit that mounts the screen, so that whoever asks
 * whether any plate is pending after that commit hears yes.
 */
export function usePlateTicket(): () => void {
  const open = useRef(false);
  const settle = useCallback(() => {
    if (!open.current) return;
    open.current = false;
    pending -= 1;
    notify();
  }, []);
  useLayoutEffect(() => {
    open.current = true;
    pending += 1;
    notify();
    return settle;
  }, [settle]);
  return settle;
}

export type ShownPlate = { theme: ThemeName; screen: ScreenId };
let lastShown: ShownPlate | null = null;

/** The plate that was drawn most recently, which is the one a new screen's plate arrives over. */
export const lastShownPlate = (): ShownPlate | null => lastShown;
export const noteShownPlate = (theme: ThemeName, screen: ScreenId): void => {
  lastShown = { theme, screen };
};

/**
 * Whether the Night plate that a loop lies over has been drawn. A loop that reveals itself before
 * the still beneath it exists would fade in over a flat colour, which is the dark it must never
 * come from. True outside a background, where there is nothing to wait for.
 */
export const PosterShownContext = createContext(true);
export const usePosterShown = (): boolean => useContext(PosterShownContext);

export function resetPlatesForTests(): void {
  pending = 0;
  lastShown = null;
  notify();
}
