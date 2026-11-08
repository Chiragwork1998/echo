import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { ownWindowOpen } from '@/state/ownWindows';
import { usePreferences } from '@/state/preferences';
import { reanimatedMock } from '@/testing/reanimatedMock';
import {
  backOutOfDialog,
  chooseInDialog,
  dialogChoices,
  dialogPrimary,
  modalHost,
  openDialog,
  renderDialogHost,
  renderWithDialogs,
  tapOutsideDialog,
} from '@/testing/dialogs';

import {
  arrange,
  clearDialogs,
  DialogHost,
  showDialog,
  type DialogButton,
  type WithdrawDialog,
} from './Dialog';

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
    // Answered, it fades away: it stays one of ECHO’s own windows until it has gone.
    expect(openDialog()).toBeNull();
    expect(ownWindowOpen()).toBe(true);
    await waitFor(() => expect(ownWindowOpen()).toBe(false));
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
    const back = modalHost().onRequestClose as () => void;
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
    // The second question is on the same sheet, never a second one, and the window never closed.
    expect(screen.getAllByTestId('dialog')).toHaveLength(1);
    expect(ownWindowOpen()).toBe(true);
    await chooseInDialog('Delete everything');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('a question that no longer stands', () => {
  const waiting = 'Still turning your voice into words';

  it('is taken back unanswered, once, and none of its buttons is pressed', async () => {
    const wait = jest.fn();
    const goOn = jest.fn();
    const instead = jest.fn();
    await renderDialogHost();
    let withdraw: WithdrawDialog = () => false;
    await act(() => {
      withdraw = showDialog(waiting, 'Plain words.', [
        { text: 'Wait', onPress: wait },
        { text: 'Go on', onPress: goOn },
      ]);
    });
    let taken = false;
    await act(() => {
      taken = withdraw(instead);
    });
    expect(taken).toBe(true);
    expect(instead).toHaveBeenCalledTimes(1);
    expect(openDialog()).toBeNull();
    expect(wait).not.toHaveBeenCalled();
    expect(goOn).not.toHaveBeenCalled();
    expect(withdraw(instead)).toBe(false);
    expect(instead).toHaveBeenCalledTimes(1);
  });

  it('cannot be taken back once the person has answered it', async () => {
    const instead = jest.fn();
    await renderDialogHost();
    let withdraw: WithdrawDialog = () => false;
    await act(() => {
      withdraw = showDialog('Record again?', 'Plain words.', [
        { text: 'Record again' },
        { text: 'Cancel', style: 'cancel' },
      ]);
    });
    await chooseInDialog('Record again');
    expect(withdraw(instead)).toBe(false);
    expect(instead).not.toHaveBeenCalled();
  });

  it('gives its window to the question asked in its place', async () => {
    await renderDialogHost();
    let withdraw: WithdrawDialog = () => false;
    await act(() => {
      withdraw = showDialog(waiting, 'Plain words.', [{ text: 'Wait' }, { text: 'Go on' }]);
    });
    await act(() => {
      withdraw(() =>
        showDialog('Your recording has no words yet', 'Plain words.', [
          { text: 'Try again' },
          { text: 'Go on' },
        ]),
      );
    });
    expect(screen.getByRole('header', { name: 'Your recording has no words yet' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: waiting })).toBeNull();
    expect(dialogChoices()).toEqual(['Try again', 'Go on']);
  });

  it('leaves the dialog in front alone when it was still waiting its turn', async () => {
    await renderDialogHost();
    await ask('Delete this echo?', [
      { text: 'Delete', style: 'destructive' },
      { text: 'Cancel', style: 'cancel' },
    ]);
    let withdraw: WithdrawDialog = () => false;
    await act(() => {
      withdraw = showDialog('Record again?', 'Plain words.', [{ text: 'Record again' }]);
    });
    await act(() => {
      withdraw();
    });
    expect(screen.getByRole('header', { name: 'Delete this echo?' })).toBeTruthy();
    await chooseInDialog('Cancel');
    expect(openDialog()).toBeNull();
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

describe('a choice that takes the page away', () => {
  // Keep draft, and Discard on the first echo: the answer is given, and the session navigates, while
  // the sheet leaves. The window must go on being one window, fading, from the choice to its end.
  const realTiming = reanimatedMock.withTiming;
  const timing = jest.spyOn(reanimatedMock, 'withTiming');
  afterEach(() => timing.mockImplementation(realTiming as never));

  function Pages() {
    const [page, setPage] = useState<'session' | 'home'>('session');
    return page === 'session' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() =>
          showDialog('Keep your draft?', 'It stays on this device.', [
            { text: 'Keep draft', onPress: () => setPage('home') },
            { text: 'Stay', style: 'cancel' },
          ])
        }
      >
        <Text>Back</Text>
      </Pressable>
    ) : (
      <Text>Home</Text>
    );
  }

  const stage = () => screen.queryByTestId('dialog-stage', { includeHiddenElements: true });
  type Done = (finished: boolean) => void;

  /** The screen is busy mounting the page it is going to: no fade is drawn until it lets go. */
  function busy() {
    const waiting: Done[] = [];
    timing.mockImplementation(((value: unknown, _config: unknown, done?: Done) => {
      if (done) waiting.push(done);
      return value;
    }) as never);
    return () =>
      act(() => {
        waiting.splice(0).forEach((done) => done(true));
      });
  }

  /** One character for each frame: the window is there (S) or it is not (.). */
  async function frames(count: number) {
    let drawn = '';
    for (let frame = 0; frame < count; frame++) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(16);
      });
      drawn += stage() ? 'S' : '.';
    }
    return drawn;
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('never blinks: the window is there for every frame of the exit, then gone for good', async () => {
    await renderWithDialogs(<Pages />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(700);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Keep draft' }));
    expect(screen.getByText('Home')).toBeTruthy();
    expect(await frames(40)).toMatch(/^S+\.+$/);
  });

  it('is still whole when the screen is too busy to draw its fade, and goes only once it has been drawn', async () => {
    await renderWithDialogs(<Pages />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(700);
    });
    const draw = busy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep draft' }));
    // 900 ms of a screen that cannot draw: a clock-driven exit would have taken the window at 280.
    expect(await frames(56)).toBe('S'.repeat(56));
    await draw();
    expect(stage()).toBeNull();
  });

  it('leaves the window’s own properties alone from the choice to the last frame', async () => {
    await renderWithDialogs(<Pages />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(700);
    });
    const told = () =>
      Object.entries(modalHost()).filter(([, value]) => typeof value !== 'function');
    const open = told();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep draft' }));
    expect(told()).toEqual(open);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });
  });
});
