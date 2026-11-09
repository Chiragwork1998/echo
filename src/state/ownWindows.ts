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

/**
 * The system's own screens that ECHO opens and waits on: the file picker. Not a window of ECHO's: it is
 * another Activity, so opening it takes the app out of the active state as well as taking the window's
 * focus, and what the app switcher would then show is that screen and none of ECHO's. The privacy cover
 * has nothing to hide, and so is neither raised for one nor left standing when it closes.
 */
let pickers = 0;
const closedListeners = new Set<() => void>();

/** Counts the picker as open, until the function it returns is called: when it has answered, however. */
export function openSystemPicker(): () => void {
  pickers += 1;
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    pickers -= 1;
    if (pickers === 0) closedListeners.forEach((listener) => listener());
  };
}

/** True while the system's picker is on top of the app. */
export function systemPickerOpen(): boolean {
  return pickers > 0;
}

/**
 * Called once the last picker has answered. Its answer reaches JavaScript ahead of the activity's
 * resume, and the app is on its way back to the front by definition: the result was handed to it.
 */
export function onSystemPickerClosed(listener: () => void): { remove: () => void } {
  closedListeners.add(listener);
  return { remove: () => void closedListeners.delete(listener) };
}
