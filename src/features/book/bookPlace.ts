// Where the book rests on the screen. The daily book sits in the middle of the screen (D-010), and the
// keyboard lifts it as it comes, as far as it needs to and no further, then lets it settle back.

/** The quiet row sits this high above the keyboard, and the book keeps clear of it. */
export const ROW_CLEARANCE = 16 + 44 + 8;

/** How far below its place clear of the keyboard the book rests, to sit in the middle of the screen. */
export function restingDrop(screenHeight: number, clearTop: number, bookHeight: number) {
  return Math.max(0, (screenHeight - bookHeight) / 2 - clearTop);
}

/** How far the book rises from its resting place for a keyboard of this height. */
export function keyboardRise(
  keyboardHeight: number,
  screenHeight: number,
  restingBottom: number,
  drop: number,
) {
  'worklet';
  const overlap = keyboardHeight + ROW_CLEARANCE + restingBottom - screenHeight;
  return Math.min(drop, Math.max(0, overlap));
}

/**
 * Distance from the bottom of the screen to the quiet row. It keeps its place until the keys would
 * reach it, and then rides with them one to one, so that it never jumps as the keyboard comes or goes.
 */
export function controlsBottom(keyboardHeight: number, resting: number, above: number) {
  'worklet';
  return Math.max(resting, keyboardHeight + above);
}
