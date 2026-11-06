/** The run in progress, if there is one. */
export type Flight<T> = { current: Promise<T> | null };

/**
 * Joins the run in progress, or starts one.
 *
 * The slot is cleared by a continuation, which always runs after the assignment below. Clearing it
 * from inside an async task, as `slot ??= (async () => { ...; slot = null; })()` does, is not safe: a
 * task that finishes without awaiting clears the slot first and is stored in it afterwards. Every
 * later call then gets that settled promise back and silently does nothing.
 */
export function singleFlight<T>(flight: Flight<T>, task: () => Promise<T>): Promise<T> {
  if (flight.current) return flight.current;
  const run = task().finally(() => {
    flight.current = null;
  });
  flight.current = run;
  return run;
}
