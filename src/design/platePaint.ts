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
 * - The plate that is on show is drawn beneath the whole navigator, always (see PlateBacking), and a
 *   plate that arrives on a new screen comes up over it once its own is drawn (see EchoBackground), so
 *   a screen change never shows a flat colour either, not even for the moment between one screen
 *   going and the next one's photograph being ready.
 */

/** The longest a plate that has not come up may hold the splash. */
export const PLATE_WAIT_MS = 1500;
/**
 * A plate that is drawn within this long of its screen mounting was already to hand, and replaces
 * the one beneath it at once, as it always did. One that takes longer comes up over it, softly.
 */
export const PLATE_LATE_MS = 80;

/**
 * How visible a plate is while it is held back, until it is drawn and comes up over the old one. Not
 * nought: a view that is wholly transparent is skipped when a frame is drawn, so the photograph would
 * only be put on the GPU in the first frame of its own dissolve, which on a slow phone is a frame
 * of a quarter of a second, and the whole dissolve is then skipped over (the walk saw the photograph
 * cut in). At one in a hundred it is drawn, and uploaded, while it cannot be told from the old
 * photograph beneath it, and its dissolve begins on a frame that has nothing left to wait for.
 */
export const PLATE_HELD_OPACITY = 0.01;

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

/**
 * The plate that is on show, which the plate backing beneath the whole navigator draws (see
 * PlateBacking) and which a plate that arrives on a new screen comes up over.
 *
 * Every plate that is wholly up reports itself under its own name, and takes its place on top. A
 * plate that goes (its screen is left) is released, and the plate that is on show is then the newest
 * of those that remain: Home's photograph again, once Completion has gone from over it. When every
 * plate has gone at once, as a whole stack does when onboarding is replaced by Home, the plate that
 * was on show stays, so that there is always a photograph to stand on and never a flat colour.
 */
type Live = { owner: string; plate: ShownPlate };
let live: Live[] = [];
let backing: ShownPlate | null = null;
/** What was on show when the screens that are going began to go. */
let backingBeforeRelease: ShownPlate | null = null;
let releaseQueued = false;
const backingListeners = new Set<() => void>();
const subscribeBacking = (listener: () => void) => {
  backingListeners.add(listener);
  return () => void backingListeners.delete(listener);
};

function setBacking(next: ShownPlate | null) {
  if (next?.theme === backing?.theme && next?.screen === backing?.screen) return;
  backing = next;
  backingListeners.forEach((listener) => listener());
}

/** The plate that is on show, or null before any has been drawn. */
export const lastShownPlate = (): ShownPlate | null => backing;
/** Re-renders as the plate that is on show changes. */
export const useBackingPlate = (): ShownPlate | null =>
  useSyncExternalStore(subscribeBacking, lastShownPlate, () => null);

/** A plate is wholly up: `owner`'s plate is now the one that is on show. */
export function noteShownPlate(owner: string, theme: ThemeName, screen: ScreenId): void {
  const plate = { theme, screen };
  live = [...live.filter((entry) => entry.owner !== owner), { owner, plate }];
  setBacking(plate);
}

/**
 * `owner`'s plate has gone. What is on show is settled a moment later, once every screen that is
 * going has gone, because they do not go in the order they were drawn in.
 */
export function releaseShownPlate(owner: string): void {
  if (!live.some((entry) => entry.owner === owner)) return;
  live = live.filter((entry) => entry.owner !== owner);
  if (releaseQueued) return;
  releaseQueued = true;
  backingBeforeRelease = backing;
  void Promise.resolve().then(() => {
    releaseQueued = false;
    const top = live[live.length - 1];
    setBacking(top ? top.plate : backingBeforeRelease);
  });
}

/**
 * Whether the Night plate that a loop lies over has been drawn. A loop that reveals itself before
 * the still beneath it exists would fade in over a flat colour, which is the dark it must never
 * come from. True outside a background, where there is nothing to wait for.
 */
export const PosterShownContext = createContext(true);
export const usePosterShown = (): boolean => useContext(PosterShownContext);

export function resetPlatesForTests(): void {
  pending = 0;
  live = [];
  backing = null;
  backingBeforeRelease = null;
  releaseQueued = false;
  notify();
  backingListeners.forEach((listener) => listener());
}
