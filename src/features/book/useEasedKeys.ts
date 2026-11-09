import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import {
  KeyboardState,
  ReduceMotion,
  useAnimatedKeyboard,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';

/** A fall of the keys by more than this, with no keyboard seen moving, is a jump and not a glide. */
export const KEYS_JUMP = 60;
/** How long the page takes over a fall of the keys that jumped. */
export const KEYS_EASE_MS = tokens.motion.standard;
/**
 * How long a keyboard that Reanimated still holds open is believed once React Native has seen the keys
 * go. Reanimated learns of the keyboard only from the animations of this screen's own window, and keys
 * that vanish under a sheet (whose window has taken the focus) are never seen to go: it goes on holding
 * them open, at their height, for this screen and for the next one. A keyboard that is really going is
 * seen moving within a frame or two.
 */
export const KEYS_STALE_MS = 250;

/**
 * The keyboard as the session sees it: how much of the screen it has, in points from the bottom edge,
 * moving the way the page, the book and the quiet row move with it. They all read this one value, so
 * they move together (the walk, v11: the row rode the keys over the page, which followed 130 ms behind).
 *
 * Only a keyboard this screen has seen is believed. Reanimated's height counts once it has been seen
 * moving a keyboard here (opening or closing), or while React Native's keyboard events say the keys are
 * up. Until then there is none, and there is none again once React Native has seen the keys go and
 * Reanimated still holds them open a moment later (the walk, v11: a session opened on a keyboard that
 * had gone under the last session's "Keep your draft?", and its book rose to the keys' place with no
 * keys on the screen).
 *
 * A keyboard seen moving is followed frame for frame, late frames too: whatever rides above it, and the
 * book that keeps clear of it, are where the keys are in every frame. Keys that come up without being
 * seen to move are followed at once as well, so nothing is ever left under them. Only keys that are gone
 * in one jump (a keyboard that goes without animating, or one that was never there) are followed over an
 * ease, decelerating, as the rest of the book moves: there is nothing left for them to cover.
 *
 * `floor` is how the visual harness reserves the room of a keyboard: the keys are never less than it.
 */
export function useEasedKeys(floor = 0): SharedValue<number> {
  const { state, height } = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
  // React Native's word on the keys, from the screen's own insets.
  const [upAtFirst] = useState(() => Keyboard.isVisible());
  const said = useSharedValue(upAtFirst);
  // Reanimated has been seen moving a keyboard on this screen.
  const moved = useSharedValue(false);
  const aim = useSharedValue(floor);
  const eased = useSharedValue(floor);

  useEffect(() => {
    let doubt: ReturnType<typeof setTimeout> | undefined;
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      clearTimeout(doubt);
      said.set(true);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      said.set(false);
      clearTimeout(doubt);
      doubt = setTimeout(() => {
        if (state.get() === KeyboardState.OPEN) moved.set(false);
      }, KEYS_STALE_MS);
    });
    return () => {
      clearTimeout(doubt);
      shown.remove();
      hidden.remove();
    };
  }, [moved, said, state]);

  useAnimatedReaction(
    () => ({ now: state.get(), keys: height.get(), believed: moved.get() || said.get() }),
    ({ now, keys, believed }) => {
      const moving = now === KeyboardState.OPENING || now === KeyboardState.CLOSING;
      if (moving && !moved.get()) moved.set(true);
      const target = Math.max(moving || believed ? keys : 0, floor);
      if (target === aim.get()) return;
      aim.set(target);
      const shown = eased.get();
      if (moving || target > shown || shown - target <= KEYS_JUMP) {
        eased.set(target);
        return;
      }
      eased.set(
        withTiming(target, {
          duration: KEYS_EASE_MS,
          easing: EASE,
          reduceMotion: ReduceMotion.Never,
        }),
      );
    },
  );
  return eased;
}
