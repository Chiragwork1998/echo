import type { PropsWithChildren } from 'react';

import { Rise } from './Resolve';

/** A card arriving: 560 ms, rising 10 pt, as the pattern cards do. */
const REVEAL_MS = 560;
const REVEAL_RISE = 10;

/**
 * Something that appears in a page because the page's state changed: it rises 10 pt and fades in
 * instead of cutting in. `duration` is 560 ms for a card; a panel that swaps in beside the page's
 * own words uses `tokens.motion.standard`. Under Reduce Motion it is 180 ms of opacity alone. It
 * animates when it mounts, so keep its key steady and a panel that stays does not replay.
 */
export function Reveal({
  delay = 0,
  duration = REVEAL_MS,
  children,
}: PropsWithChildren<{ delay?: number; duration?: number }>) {
  return (
    <Rise delay={delay} duration={duration} distance={REVEAL_RISE}>
      {children}
    </Rise>
  );
}
