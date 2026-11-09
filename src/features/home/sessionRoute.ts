import { Platform } from 'react-native';

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

/**
 * How the screens that follow Home in its stack are presented: over it, on Android.
 *
 * Android's stack (react-native-screens) takes every screen beneath its top screen down from the
 * window, and builds it again when it comes back, unless the screens above it are translucent: then
 * everything down to the first screen that is not stays up. Home lay beneath the session, Rehearse and
 * Completion, so on Enter your space Home's interface was built again after the photograph was already
 * showing, and cut in a fifth to half a second late: five samples in five in the walk (v10). Presented
 * over Home, as translucent screens, it stays up beneath them with its interface already back
 * (Completion asks for that while its card is on show), and arrives with the photograph. Breathe is
 * presented the same way, for the session it opens: the walk (v11) saw the bare plate for 130 ms after
 * a session begun from Breathe, whose plain screen had taken Home down.
 *
 * A screen presented over another stays drawn beneath whatever is presented over it in turn, so one
 * that is left beneath another must draw nothing while it is there (Breathe does: BreatheScreen).
 *
 * iOS keeps the screens beneath a pushed one, so it is left as it was. Read each time it is asked for,
 * not once, so that a test can say which platform it is.
 */
export function overHome(): { presentation?: 'transparentModal' } {
  return Platform.OS === 'android' ? { presentation: 'transparentModal' } : {};
}
