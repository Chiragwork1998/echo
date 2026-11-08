/**
 * Stopping a sound for good. On Android, expo-audio's `remove()` only takes a player off the module's
 * own list: the sound plays on, out of reach of the pause every player gets when the app goes to the
 * background, until JavaScript happens to collect the object. `release()` frees the native player, as
 * expo's own hooks do, and pausing first silences it at once whatever happens after.
 */
export type StoppablePlayer = {
  pause(): void;
  release?: () => void;
  remove?: () => void;
};

/** Silences a player and frees it. Never throws: a player can only be let go once. */
export function stopAndRelease(player: StoppablePlayer | null | undefined): void {
  if (!player) return;
  try {
    player.pause();
  } catch {
    // Already released.
  }
  try {
    if (typeof player.release === 'function') player.release();
    else player.remove?.();
  } catch {
    // Already released.
  }
}
