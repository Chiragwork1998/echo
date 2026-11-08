import { create } from 'zustand';

import { Sheet, SheetAction, SheetButton, SheetText, SheetTitle } from './Sheet';

/** One choice in a dialog, in the shape of a button given to Alert.alert. */
export type DialogButton = {
  text: string;
  onPress?: () => void;
  /**
   * 'cancel' is the way out: a quiet word, last, and what Back and a tap outside choose.
   * 'destructive' is a quiet word too, and never the inviting primary button.
   */
  style?: 'default' | 'cancel' | 'destructive';
  /** Makes this the primary button, if it is neither cancel nor destructive. Else the first is. */
  isPreferred?: boolean;
};

/** Alert.alert's options. */
export type DialogOptions = {
  /** Lets Back and a tap outside close a dialog that has no cancel-style button. */
  cancelable?: boolean;
  /** Called when a cancelable dialog is closed that way. */
  onDismiss?: () => void;
};

type Dialog = {
  title: string;
  message: string;
  buttons: readonly DialogButton[];
  options?: DialogOptions;
};

type Dialogs = {
  /** First come, first shown. The rest wait their turn, each with its callbacks. */
  queue: readonly Dialog[];
  /** The dialog shown last, still drawn while its window fades, so the sheet never empties. */
  last: Dialog | null;
};

const useDialogs = create<Dialogs>(() => ({ queue: [], last: null }));
/** Answered dialogs, so that a second tap on the way out, or Back as well, does nothing. */
const answered = new WeakSet<Dialog>();
const nothing = () => undefined;
/** Each dialog's own number, so the sheet can tell one question from the next. */
const identities = new WeakMap<Dialog, number>();
let nextIdentity = 0;
const identityOf = (dialog: Dialog): number => {
  const known = identities.get(dialog);
  if (known !== undefined) return known;
  identities.set(dialog, ++nextIdentity);
  return nextIdentity;
};

/**
 * Takes back a dialog whose question no longer stands, unanswered: what it waited on has happened.
 * `instead` runs in an answer's place, so a dialog it asks for takes this one's window without a
 * flicker. Returns false, and runs nothing, once the dialog has been answered.
 */
export type WithdrawDialog = (instead?: () => void) => boolean;

/**
 * Asks the person something, in ECHO's own sheet. The arguments are Alert.alert's, and it works from
 * anywhere, in a component or not. Asked while another dialog is open, it waits its turn. Keep the
 * words to the app's own: never anything the person wrote.
 */
export function showDialog(
  title: string,
  message: string,
  buttons: readonly [DialogButton, ...DialogButton[]],
  options?: DialogOptions,
): WithdrawDialog {
  const dialog: Dialog = { title, message, buttons, options };
  useDialogs.setState(({ queue }) => ({ queue: [...queue, dialog] }));
  return (instead = nothing) => settle(dialog, instead);
}

/** Removes every dialog, answered or not. Tests use it to start clean. */
export function clearDialogs(): void {
  useDialogs.setState({ queue: [], last: null });
}

/**
 * The sheet's one primary button and the quiet words beneath it, in the order a person meets them.
 * The primary is the action the dialog exists to offer: never Cancel, and never something that
 * destroys. Destructive actions and Cancel are quiet words, and Cancel comes last.
 */
export function arrange(buttons: readonly DialogButton[]): {
  primary: DialogButton | null;
  quiet: DialogButton[];
} {
  const offered = buttons.filter(({ style }) => style !== 'cancel' && style !== 'destructive');
  const primary = offered.find((button) => button.isPreferred) ?? offered[0] ?? null;
  const others = buttons.filter((button) => button !== primary && button.style !== 'cancel');
  const cancels = buttons.filter((button) => button.style === 'cancel');
  return { primary, quiet: [...others, ...cancels] };
}

/**
 * What Back, Escape and a tap outside choose: the cancel-style button, as a person means it. With
 * none, a dialog its caller made cancelable closes and calls onDismiss, as Android's alert does. Any
 * other dialog stays until a button is chosen, so nothing is decided for the person.
 */
function dismissal({ buttons, options }: Dialog): (() => void) | null {
  const cancel = buttons.find((button) => button.style === 'cancel');
  if (cancel) return cancel.onPress ?? nothing;
  if (options?.cancelable) return options.onDismiss ?? nothing;
  return null;
}

/**
 * Does what was chosen, then takes the dialog away. A dialog that the choice asks for is queued
 * behind this one first, so it takes this one's place in the same window, without a flicker.
 * Returns whether it settled: a dialog is answered once.
 */
function settle(dialog: Dialog, choice: () => void): boolean {
  if (answered.has(dialog)) return false;
  answered.add(dialog);
  try {
    choice();
  } finally {
    useDialogs.setState(({ queue }) => ({
      queue: queue.filter((waiting) => waiting !== dialog),
      last: dialog,
    }));
  }
  return true;
}

/**
 * Mounted once, at the root. Shows the first dialog waiting, in the sheet's cloth: its title, its
 * message, and its buttons as arrange() lays them out. `held` keeps it off the screen, and in the
 * queue, while the journal is locked: a dialog would otherwise sit above the lock and answer for
 * someone who has not unlocked.
 */
export function DialogHost({ held = false }: { held?: boolean }) {
  const current = useDialogs((state) => state.queue[0] ?? null);
  const last = useDialogs((state) => state.last);
  const dialog = current ?? last;
  if (!dialog) return null;

  const { primary, quiet } = arrange(dialog.buttons);
  const choose = (button: DialogButton) => settle(dialog, button.onPress ?? nothing);
  const dismiss = () => {
    const choice = dismissal(dialog);
    if (choice) settle(dialog, choice);
  };

  return (
    <Sheet
      visible={current !== null && !held}
      animated={!held}
      onClose={dismiss}
      // A second question stays on the same sheet and fades in, rather than rising again.
      contentKey={identityOf(dialog)}
      testID="dialog"
      footer={
        <>
          {primary ? <SheetButton label={primary.text} onPress={() => choose(primary)} /> : null}
          {quiet.map((button, index) => (
            <SheetAction
              key={`${index}:${button.text}`}
              label={button.text}
              onPress={() => choose(button)}
            />
          ))}
        </>
      }
    >
      <SheetTitle>{dialog.title}</SheetTitle>
      {dialog.message ? <SheetText>{dialog.message}</SheetText> : null}
    </Sheet>
  );
}
