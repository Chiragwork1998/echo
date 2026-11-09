import { Image, type ImageRef } from 'expo-image';
import { useEffect, useSyncExternalStore } from 'react';

import { backgroundSources } from './generated/backgrounds';
import type { ThemeName } from './tokens';

/**
 * Home's plate, decoded once at the size of a thumbnail and kept, for the card's picture and the
 * header's avatar. Each was a crop of the plate that was decoded on its own whenever its screen
 * mounted, which is a frame or more. They were empty for that frame and then popped in, at the first
 * welcome and again after every tab change, because the screen is re-attached each time it comes
 * back (the walk, v10). An image that is already decoded is drawn whole in the first frame it is asked
 * for, and is drawn the same way every time after.
 *
 * Two thumbnails at about 1.6 MB each is what is held: the picture is shown 72 pt across at most, which
 * is under 220 px on any phone, and this is twice that.
 */
export const THUMB_LIMIT = { maxWidth: 432, maxHeight: 936 } as const;

const THEMES: readonly ThemeName[] = ['night', 'day'];
const ready: Partial<Record<ThemeName, ImageRef>> = {};
const loading: Partial<Record<ThemeName, Promise<void>>> = {};
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

function warm(theme: ThemeName): Promise<void> {
  if (ready[theme]) return Promise.resolve();
  const running = loading[theme];
  if (running) return running;
  // A build whose image module cannot load to memory draws the plate itself, as it always did.
  if (typeof Image.loadAsync !== 'function') return Promise.resolve();
  const load = (async () => {
    try {
      ready[theme] = await Image.loadAsync(backgroundSources[theme].home, THUMB_LIMIT);
      listeners.forEach((listener) => listener());
    } catch {
      // Nothing is held, and the next one to ask tries again.
    } finally {
      delete loading[theme];
    }
  })();
  loading[theme] = load;
  return load;
}

/** Decodes both themes' thumbnails, the one that is on show first. Safe to ask again. */
export async function warmPlateThumbs(first: ThemeName): Promise<void> {
  const order = [first, ...THEMES.filter((theme) => theme !== first)];
  await Promise.all(order.map(warm));
}

/**
 * The decoded thumbnail for a theme, or null until it is ready. The first screen to want one asks for
 * it, if no one has.
 */
export function usePlateThumb(theme: ThemeName): ImageRef | null {
  useEffect(() => {
    void warm(theme);
  }, [theme]);
  return useSyncExternalStore(
    subscribe,
    () => ready[theme] ?? null,
    () => null,
  );
}

export function resetPlateThumbsForTests(): void {
  for (const theme of THEMES) {
    delete ready[theme];
    delete loading[theme];
  }
  listeners.forEach((listener) => listener());
}
