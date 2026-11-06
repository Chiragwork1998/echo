import { useEffect, useState } from 'react';

import { STILLNESS_MS } from './sky';

/**
 * False while the mountains have the screen to themselves, then true. With Reduce Motion it is true
 * at once: there is nothing to wait for, and nothing will move.
 */
export function useStillness(reduceMotion: boolean) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (reduceMotion) return;
    const timer = setTimeout(() => setSettled(true), STILLNESS_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion]);
  return settled || reduceMotion;
}
