/**
 * ECHO's own windows: its sheets, its dialogs, and the pickers it opens. Android reports each one
 * taking focus as the app's 'blur', exactly as it reports the app switcher opening, so the root
 * layout asks here before it raises the privacy cover early. Plain module state rather than React
 * state, because the count has to be right the moment native code reports the blur, not a render
 * later.
 */
let open = 0;

/** Counts one of ECHO's own windows as open, until the function it returns is called. */
export function openOwnWindow(): () => void {
  open += 1;
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    open -= 1;
  };
}

/** True while any of ECHO's own windows is open. */
export function ownWindowOpen(): boolean {
  return open > 0;
}
