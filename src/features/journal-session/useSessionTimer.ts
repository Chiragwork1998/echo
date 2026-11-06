import { useCallback, useEffect, useState } from 'react';

import { SESSION_SECONDS } from './geometry';
import type { TimerState } from './TimerRing';

const TICK_MS = 1000;
/** A tick that arrives late, such as after the app slept, counts for no more than this. */
const MAX_TICK_MS = 2000;

/**
 * Seven minutes, counted down from the first typed character or the start of a recording. It only
 * ever advances while the app is running, and it never stops the writing: at zero it simply rests.
 * `base` is time already spent on a draft that is being continued.
 */
export function useSessionTimer(base = 0) {
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const start = useCallback(() => setRunning(true), []);

  useEffect(() => {
    if (!running) return;
    let last = Date.now();
    const tick = setInterval(() => {
      const now = Date.now();
      // Measured now: a state updater runs later, after `last` has moved on.
      const spent = Math.min(now - last, MAX_TICK_MS);
      last = now;
      setElapsedMs((total) => total + spent);
    }, TICK_MS);
    return () => clearInterval(tick);
  }, [running]);

  const elapsed = base + Math.floor(elapsedMs / 1000);
  const remaining = Math.max(0, SESSION_SECONDS - elapsed);
  const state: TimerState = !running ? 'idle' : remaining === 0 ? 'complete' : 'active';
  return { elapsed, remaining, state, running, start };
}
