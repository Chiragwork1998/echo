import { act, fireEvent } from '@testing-library/react-native';

/**
 * A finger going down on a Pressable and sliding off it, as its press feedback sees them: `pressed`
 * is true between the two. RNTL's own `pressIn` finds no handler on a Pressable, so this sends the
 * responder events the Pressable listens to. Where the clock is fake, pass `afterRelease` so the
 * Pressable's short pressed hold (about 130 ms) can pass.
 */
type Element = Parameters<typeof fireEvent>[0];
const touch = { persist: () => undefined, currentTarget: { measure: () => undefined } };
const event = { ...touch, nativeEvent: { touches: [], changedTouches: [], timestamp: 0 } };

export async function fingerDown(element: Element) {
  await fireEvent(element, 'responderGrant', event);
}

/** The finger slides away or is taken by something else: `pressed` ends and nothing is pressed. */
export async function fingerAway(element: Element, afterRelease?: () => Promise<void>) {
  await fireEvent(element, 'responderTerminate', event);
  if (afterRelease) await afterRelease();
  else await act(async () => undefined);
}
