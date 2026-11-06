import { useEffect, useState } from 'react';

import { STILLNESS_MS } from './sky';

/**
 * False while the mountains have the screen to themselves, then true. With Reduce Motion it is true
 * at once: there is nothing to wait for, and nothing will move. It is shorter once the ritual has
 * become familiar (D-008).
 */
export function useStillness(reduceMotion: boolean, ms = STILLNESS_MS) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (reduceMotion) return;
    const timer = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(timer);
  }, [reduceMotion, ms]);
  return settled || reduceMotion;
}
