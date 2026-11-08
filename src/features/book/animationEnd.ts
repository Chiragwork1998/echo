import { useCallback } from 'react';
import { ReduceMotion, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

import { ANIMATION_NET_MS, ANIMATION_SLOWDOWN, UI_HANG_MS } from './ritual';

/** How long after its first frame an animation of `duration` ms is let go of, if it never says it is over. */
export const netAfterBegin = (duration: number) => duration * ANIMATION_SLOWDOWN + ANIMATION_NET_MS;

/**
 * What the book waits for when it waits for an animation to end. The animation is the book's, and runs
 * on the UI thread; the wait is JS's, and it is told, by the animation's own callback, when the motion is
 * over. A clock must never stand in for that: the UI thread of a slow phone begins an animation seconds
 * after JS asks for it (the walked emulator, 1.8 to 2.1 s), and a timer started when JS asked would go off
 * a third of the way into the motion and declare it done.
 *
 * So a wait has two nets, and neither is the clock of the motion:
 * - Once the UI thread has begun the animation (`began`), a net is set (`netAfterBegin`), counted from
 *   that first frame and generous enough that an animation clock that runs slowly is not cut. A UI
 *   thread that is alive but has lost the callback is let go of.
 * - Before that, there is only a backstop, UI_HANG_MS beyond the animation's time and counted from the
 *   ask: a UI thread that never begins at all.
 */
export type Watch = {
  /** The UI thread has begun the animation (its first frame): the net can be set from here. */
  began: () => void;
  /**
   * The animation has said it is over. It does not matter whether it finished or something else
   * cancelled it, since nothing more is coming from it; a run that is itself being replaced is
   * `cancel`led first, so that what it cancelled says nothing.
   */
  ended: () => void;
  /** This run of the animation is over (it is replaced, or the screen is going): nothing may happen. */
  cancel: () => void;
};

/**
 * Watches an animation of `duration` ms that was just handed to the UI thread. `end` runs once, on the JS
 * thread, when the animation ends, or when a net says it will not. Every function it returns is safe to
 * hand to a worklet: none of them uses `this`.
 */
export function watchAnimation(duration: number, end: () => void): Watch {
  let over = false;
  let net: ReturnType<typeof setTimeout> | undefined;
  let backstop: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(net);
    clearTimeout(backstop);
  };
  const finish = () => {
    if (over) return;
    over = true;
    clear();
    end();
  };
  backstop = setTimeout(finish, duration + UI_HANG_MS);
  return {
    began: () => {
      if (over || net !== undefined) return;
      clearTimeout(backstop);
      net = setTimeout(finish, netAfterBegin(duration));
    },
    ended: finish,
    cancel: () => {
      over = true;
      clear();
    },
  };
}

/**
 * Hands the UI thread a beat of a millisecond, with whatever was handed to it just before, and runs `then`
 * on the JS thread when the UI thread has run it: that is the frame after the one in which it began
 * everything that was set before it. It is how JS learns that the UI thread has really begun a motion,
 * however late that is, without reading a value that is not yet moving. Call it straight after the
 * animations are set. (A beat of no length would end in the frame it began in, which is the same thing
 * on a phone; a millisecond waits for the animation clock to move, which is the same on any.)
 */
export function useUiBegun() {
  const beat = useSharedValue(0);
  return useCallback(
    (then: () => void) => {
      beat.set(
        withTiming(1, { duration: 1, reduceMotion: ReduceMotion.Never }, (finished) => {
          'worklet';
          // One that a later beat replaced says it did not finish, and its asker is no longer waiting.
          if (finished) runOnJS(then)();
        }),
      );
    },
    [beat],
  );
}
