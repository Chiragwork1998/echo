import { useIsFocused, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

import { tokens } from '@/design/tokens';

/**
 * How long after a page has the focus it is taken to be in view if the stack never says that its
 * transition has ended: the stack's own fade, and a little over.
 */
export const IN_VIEW_LATEST_MS = tokens.motion.standard + 80;

/** The native stack's word that a screen has finished arriving (`closing` false) or leaving. */
type Transitions = {
  addListener(
    type: 'transitionEnd',
    listener: (event: { data?: { closing?: boolean } }) => void,
  ): () => void;
};

/**
 * Whether this page is in view: the focused screen of its stack, with the stack's transition onto it
 * over. The focus moves the moment the stack is told to go back, while the screen above is still
 * there (on a phone it fades for 320 ms), so something that should be seen to happen on this page
 * waits for this instead.
 */
export function useInView(): boolean {
  const focused = useIsFocused();
  const navigation = useNavigation() as unknown as Transitions;
  const [arrived, setArrived] = useState(false);
  // Losing the focus ends it at once, in the same render.
  if (!focused && arrived) setArrived(false);
  useEffect(() => {
    if (!focused) return;
    const here = () => setArrived(true);
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (!event.data?.closing) here();
    });
    const late = setTimeout(here, IN_VIEW_LATEST_MS);
    return () => {
      unsubscribe();
      clearTimeout(late);
    };
  }, [focused, navigation]);
  return focused && arrived;
}
