import { fireEvent, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { clearDialogs, DialogHost } from '@/features/tab-pages/Dialog';

import { render } from './render';

// The dialog's sheet sits above the safe bottom. A test has no device, so there is none.
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

function Host() {
  return (
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <DialogHost />
    </SafeAreaInsetsContext.Provider>
  );
}

/** Renders with the dialog host beside the element, as the root layout mounts it, and none open. */
export function renderWithDialogs(element: ReactElement) {
  clearDialogs();
  return render(
    <>
      {element}
      <Host />
    </>,
  );
}

/** Just the host, for code that asks from outside React. */
export function renderDialogHost() {
  clearDialogs();
  return render(<Host />);
}

/** Draws the host of `renderDialogHost` again, as the screen is drawn for each frame of an animation. */
export const drawDialogHost = () =>
  screen.rerender(
    <ThemeProvider crossfade={false}>
      <Host />
    </ThemeProvider>,
  );

/**
 * The open dialog's window, or null. A dialog that has been answered stays on screen for the length
 * of its exit, hidden from everyone and untouchable, and no longer answers to its name.
 */
export const openDialog = () => screen.queryByTestId('dialog');

const dialogButtons = () => within(screen.getByTestId('dialog')).getAllByRole('button');

/** The open dialog's buttons, by name, in the order a person meets them. */
export const dialogChoices = () =>
  dialogButtons().map((button) => String(button.props.accessibilityLabel));

/** The name of the dialog's primary button, the one at the CTA's 56 pt, or null if it has none. */
export function dialogPrimary(): string | null {
  const primary = dialogButtons().filter(
    (button) => StyleSheet.flatten(button.props.style)?.height === tokens.size.primaryButtonHeight,
  );
  if (primary.length > 1) throw new Error('A dialog has at most one primary button.');
  return primary[0] ? String(primary[0].props.accessibilityLabel) : null;
}

/** Presses a button in the dialog by its name, as a person would, once the dialog is there. */
export async function chooseInDialog(name: string) {
  const dialog = await screen.findByTestId('dialog');
  await fireEvent.press(await within(dialog).findByRole('button', { name }));
}

type Json = { type: string; props: Record<string, unknown>; children?: unknown };
const MODAL_HOST = 'Modal'; // what react-native's Modal is drawn as under jest

/**
 * The window itself, as the native side receives it: the properties of the Modal that holds a sheet.
 * The sheet's name is on what is inside, so that it can be taken away as the sheet leaves without the
 * window being told anything.
 */
export function modalHost(): Record<string, unknown> {
  const walk = (node: unknown): Json | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    }
    const json = node as Json;
    return json.type === MODAL_HOST ? json : walk(json.children);
  };
  const host = walk(screen.toJSON());
  if (!host) throw new Error('No window is open.');
  return host.props;
}

/**
 * The sheet's window reporting its size, as a Modal's does once the system has made the window: it is
 * laid out at nothing first, and a sheet does not begin to arrive until it has a size. `testID` is the
 * sheet's own name ('dialog' for a dialog).
 */
export const layOutSheet = (testID = 'dialog') =>
  fireEvent(screen.getByTestId(`${testID}-stage`, { includeHiddenElements: true }), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 852 } },
  });

/** The system Back button, with the dialog open. */
export const backOutOfDialog = () => fireEvent(screen.getByTestId('dialog'), 'requestClose');

/** A tap on the dimmed page around the dialog, which screen readers rightly never reach. */
export const tapOutsideDialog = () =>
  fireEvent.press(screen.getByTestId('dialog-outside', { includeHiddenElements: true }));
