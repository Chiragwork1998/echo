import {
  ReduceMotion,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';

/** A move of the keys by more than this, between one reading and the next, is a jump and not a glide. */
export const KEYS_JUMP = 60;
/** How long the book takes over a jump of the keys. */
export const KEYS_EASE_MS = tokens.motion.standard;

/**
 * The keys as the book sees them: the height of the keyboard (and never less than `floor`, which is how
 * the visual harness reserves the room of one), made to move the way the book should.
 *
 * The book rises with the keyboard, and the closed book steps back from the question beneath it and comes
 * forward again as the keys go. A keyboard that animates gives a new height at every frame, a few points
 * apart, and the book follows each one. A keyboard that goes without animating (the walked Android
 * emulator's, or any frame that comes late) gives one height, a long way from the last, and the book would
 * jump from its stepped-back size to its full size in a single frame. A move of more than `KEYS_JUMP` is
 * therefore followed over `KEYS_EASE_MS`, decelerating, as the rest of the book moves.
 */
export function useEasedKeys(keyboard: SharedValue<number>, floor = 0): SharedValue<number> {
  const eased = useSharedValue(floor);
  useAnimatedReaction(
    () => Math.max(keyboard.get(), floor),
    (height) => {
      const shown = eased.get();
      if (height === shown) return;
      eased.set(
        Math.abs(height - shown) > KEYS_JUMP
          ? withTiming(height, {
              duration: KEYS_EASE_MS,
              easing: EASE,
              reduceMotion: ReduceMotion.Never,
            })
          : height,
      );
    },
  );
  return eased;
}
