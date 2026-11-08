/**
 * The daily session's route options. It is pushed once Home has melted, so its fade in is never
 * seen; the stack's own fade out (its default, 320 ms, and 180 ms under Reduce Motion) is what lets
 * the book go gently when the person leaves, instead of vanishing in one frame. Transparent, so the
 * one photograph drawn beneath the stack shows through.
 */
export const SESSION_ROUTE = {
  gestureEnabled: false,
  contentStyle: { backgroundColor: 'transparent' },
} as const;
