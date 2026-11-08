import { useEffect, useState } from 'react';

/**
 * `value`, but only once it has been true for `delayMs` without a break; false the moment it is
 * false. A local read usually returns before a quarter of a second, and a skeleton drawn for the
 * blink before it would only flash. Resets whenever `value` goes false.
 */
export function useDelayedTrue(value: boolean, delayMs: number): boolean {
  const [late, setLate] = useState(false);
  // Falling resets the wait, in the same render, so the next rise starts it afresh.
  if (!value && late) setLate(false);
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return value && late;
}
