import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { ownWindowOpen } from '@/state/ownWindows';
import { usePreferences } from '@/state/preferences';
import {
  backOutOfDialog,
  chooseInDialog,
  dialogChoices,
  dialogPrimary,
  openDialog,
  renderDialogHost,
  tapOutsideDialog,
} from '@/testing/dialogs';

import { arrange, clearDialogs, DialogHost, showDialog, type DialogButton } from './Dialog';

const names = ({ primary, quiet }: ReturnType<typeof arrange>) => ({
  primary: primary?.text ?? null,
  quiet: quiet.map((button) => button.text),
});

const ask = (title: string, buttons: [DialogButton, ...DialogButton[]]) =>
  act(() => showDialog(title, 'What happens next, in plain words.', buttons));

type Node = ReturnType<typeof screen.getByRole>;

/** The sheet itself: the view that holds the dialog, and that VoiceOver's escape reaches. */
function panel(): Node {
  let node: Node | null = screen.getByRole('header');
  while (node && !node.props.accessibilityViewIsModal) node = node.parent;
  if (!node) throw new Error('No dialog is open.');
  return node;
}

beforeEach(() => {
  usePreferences.setState({ theme: 'night' });
});

describe('the buttons', () => {
  it('make the action the dialog offers the one primary, and put Cancel last', () => {
    const buttons: DialogButton[] = [{ text: 'Cancel', style: 'cancel' }, { text: 'Record again' }];
    expect(names(arrange(buttons))).toEqual({ primary: 'Record again', quiet: ['Cancel'] });
  });

  it('never make a destructive action the inviting button: it is a quiet word, like Cancel', () => {
    const buttons: DialogButton[] = [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ];
    expect(names(arrange(buttons))).toEqual({ primary: null, quiet: ['Delete', 'Cancel'] });
  });

  it('keep the other quiet words in order, between the primary and Cancel', () => {
    const buttons: DialogButton[] = [
      { text: 'Keep draft' },
      { text: 'Discard', style: 'destructive' },
      { text: 'Stay', style: 'cancel' },
    ];
    expect(names(arrange(buttons))).toEqual({ primary: 'Keep draft', quiet: ['Discard', 'Stay'] });
  });

  it('make the first of two offers primary, unless the caller prefers the other', () => {
    expect(names(arrange([{ text: 'Wait' }, { text: 'Go on' }]))).toEqual({
      primary: 'Wait',
      quiet: ['Go on'],
    });
    expect(names(arrange([{ text: 'Wait' }, { text: 'Go on', isPreferred: true }]))).toEqual({
      primary: 'Go on',
      quiet: ['Wait'],
    });
  });

  it('keep a destructive action quiet even when it is preferred', () => {
    const buttons: DialogButton[] = [
      { text: 'Erase', style: 'destructive', isPreferred: true },
      { text: 'Cancel', style: 'cancel' },
    ];
    expect(names(arrange(buttons))).toEqual({ primary: null, quiet: ['Erase', 'Cancel'] });
  });
});

describe('the dialog', () => {
  it('shows its title as a header, its message, and the primary at the CTA’s 56 pt', async () => {
    await renderDialogHost();
    await ask('Record again?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Record again' }]);
    expect(screen.getByRole('header', { name: 'Record again?' })).toBeTruthy();
    expect(screen.getByText('What happens next, in plain words.')).toBeTruthy();
    expect(dialogChoices()).toEqual(['Record again', 'Cancel']);
    expect(dialogPrimary()).toBe('Record again');
    expect(screen.getByRole('button', { name: 'Record again' })).toHaveStyle({
      height: tokens.size.primaryButtonHeight,
    });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveStyle({
      minHeight: tokens.size.tapTarget,
    });
  });

  it('shows no inviting button when all it offers is to destroy something', async () => {
    await renderDialogHost();
    await ask('Delete this echo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]);
    expect(dialogChoices()).toEqual(['Delete', 'Cancel']);
    expect(dialogPrimary()).toBeNull();
  });

  it('runs the chosen button, and closes', async () => {
    const replace = jest.fn();
    const cancel = jest.fn();
    await renderDialogHost();
    await ask('Record again?', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Record again', onPress: replace },
    ]);
    await chooseInDialog('Record again');
    expect(replace).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
  });

  it('is one of ECHO’s own windows while it shows, so Android’s blur does not cover the page', async () => {
    await renderDialogHost();
    expect(ownWindowOpen()).toBe(false);
    await ask('Record again?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Record again' }]);
    expect(ownWindowOpen()).toBe(true);
    await chooseInDialog('Cancel');
    expect(ownWindowOpen()).toBe(false);
  });
});

describe('Back and a tap outside', () => {
  const cancelled = async (leave: () => Promise<unknown>) => {
    const cancel = jest.fn();
    const erase = jest.fn();
    await renderDialogHost();
    await ask('Erase everything?', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Erase', style: 'destructive', onPress: erase },
    ]);
    await leave();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(erase).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
  };

  it('Back does what the cancel-style button does', () => cancelled(backOutOfDialog));
  it('a tap outside does what the cancel-style button does', () => cancelled(tapOutsideDialog));
  it('VoiceOver’s escape does what the cancel-style button does', () =>
    cancelled(() => fireEvent(panel(), 'accessibilityEscape')));

  it('decide nothing when there is no cancel-style button: the dialog waits for a choice', async () => {
    const wait = jest.fn();
    const goOn = jest.fn();
    await renderDialogHost();
    await ask('Still turning your voice into words', [
      { text: 'Wait', onPress: wait },
      { text: 'Go on', onPress: goOn },
    ]);
    await backOutOfDialog();
    await tapOutsideDialog();
    expect(
      screen.getByRole('header', { name: 'Still turning your voice into words' }),
    ).toBeTruthy();
    expect(wait).not.toHaveBeenCalled();
    expect(goOn).not.toHaveBeenCalled();
    await chooseInDialog('Go on');
    expect(goOn).toHaveBeenCalledTimes(1);
  });

  it('close a dialog its caller made cancelable, and call onDismiss', async () => {
    const onDismiss = jest.fn();
    const allow = jest.fn();
    await renderDialogHost();
    await act(() =>
      showDialog('Gentle reminder', 'Plain words.', [{ text: 'Allow', onPress: allow }], {
        cancelable: true,
        onDismiss,
      }),
    );
    await backOutOfDialog();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(allow).not.toHaveBeenCalled();
    expect(openDialog()).toBeNull();
  });

  it('answer once, even when Back arrives twice before the dialog has gone', async () => {
    const cancel = jest.fn();
    await renderDialogHost();
    await ask('Record again?', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Record again' },
    ]);
    const back = screen.getByTestId('dialog').props.onRequestClose as () => void;
    await act(() => {
      back();
      back();
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('more than one dialog', () => {
  it('shows them in turn, and keeps every callback', async () => {
    const first = jest.fn();
    const second = jest.fn();
    await renderDialogHost();
    await ask('Delete this echo?', [{ text: 'Delete', style: 'destructive', onPress: first }]);
    await ask('Record again?', [{ text: 'Record again', onPress: second }]);
    expect(screen.getByRole('header', { name: 'Delete this echo?' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Record again?' })).toBeNull();

    await chooseInDialog('Delete');
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'Record again?' })).toBeTruthy();
    await chooseInDialog('Record again');
    expect(second).toHaveBeenCalledTimes(1);
    expect(openDialog()).toBeNull();
  });

  it('puts a dialog that a button asks for in the answered one’s place', async () => {
    const run = jest.fn();
    await renderDialogHost();
    await ask('Delete all data?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () =>
          showDialog('This can’t be undone', 'Gone for good.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete everything', style: 'destructive', onPress: run },
          ]),
      },
    ]);
    await chooseInDialog('Continue');
    expect(screen.getByRole('header', { name: 'This can’t be undone' })).toBeTruthy();
    expect(dialogChoices()).toEqual(['Delete everything', 'Cancel']);
    await chooseInDialog('Delete everything');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('under the lock', () => {
  const host = (held: boolean) => (
    <ThemeProvider crossfade={false}>
      <SafeAreaInsetsContext.Provider value={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <DialogHost held={held} />
      </SafeAreaInsetsContext.Provider>
    </ThemeProvider>
  );

  it('waits, unseen, and comes back with its callbacks once the journal is unlocked', async () => {
    clearDialogs();
    const erase = jest.fn();
    const view = await render(host(false));
    await ask('Erase everything?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: erase },
    ]);
    await view.rerender(host(true));
    expect(openDialog()).toBeNull();
    expect(ownWindowOpen()).toBe(false);

    await view.rerender(host(false));
    await chooseInDialog('Erase');
    expect(erase).toHaveBeenCalledTimes(1);
  });
});

describe('Day and Night', () => {
  const show = async () => {
    await renderDialogHost();
    await ask('Record again?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Record again' }]);
  };

  it('is midnight cloth with cream words by Night, and the primary is cream with ink', async () => {
    const { night } = tokens.color;
    await show();
    expect(panel()).toHaveStyle({ backgroundColor: 'rgb(12,18,30)' });
    expect(screen.getByRole('header', { name: 'Record again?' })).toHaveStyle({
      color: night.textPrimary,
    });
    expect(screen.getByText('What happens next, in plain words.')).toHaveStyle({
      color: night.textPrimary,
    });
    expect(screen.getByText('Record again')).toHaveStyle({ color: night.textInk });
    expect(screen.getByText('Cancel')).toHaveStyle({ color: night.textPrimary });
  });

  it('is cream cloth with ink words by Day, and the primary is ink with cream', async () => {
    const { day } = tokens.color;
    usePreferences.setState({ theme: 'day' });
    await show();
    expect(panel()).toHaveStyle({ backgroundColor: 'rgb(247,243,235)' });
    expect(screen.getByRole('header', { name: 'Record again?' })).toHaveStyle({
      color: day.textInk,
    });
    expect(screen.getByText('What happens next, in plain words.')).toHaveStyle({
      color: day.textInk,
    });
    expect(screen.getByText('Record again')).toHaveStyle({ color: day.textPrimary });
    expect(screen.getByText('Record again').parent).toHaveStyle({ backgroundColor: day.textInk });
    expect(screen.getByText('Cancel')).toHaveStyle({ color: day.textInk });
  });
});
