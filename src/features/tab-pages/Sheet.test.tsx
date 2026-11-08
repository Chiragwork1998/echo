import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DeviceEventEmitter, Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { ownWindowOpen } from '@/state/ownWindows';
import { modalHost } from '@/testing/dialogs';
import { reanimatedMock } from '@/testing/reanimatedMock';

import { Sheet, SheetAction, SheetButton } from './Sheet';

jest.mock('@/design/haptics');
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));

const reduced = useReduceMotion as jest.Mock;
const realTiming = reanimatedMock.withTiming;
const timing = jest.spyOn(reanimatedMock, 'withTiming');

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

type Shape = { visible: boolean; animated?: boolean; contentKey?: string; label?: string };

const sheet = ({ visible, animated, contentKey, label = 'Words on the sheet' }: Shape) => (
  <ThemeProvider crossfade={false}>
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <Sheet
        visible={visible}
        animated={animated}
        contentKey={contentKey}
        onClose={() => undefined}
        testID="sheet"
        footer={<SheetButton label="Keep it" onPress={() => undefined} />}
      >
        <Text>{label}</Text>
      </Sheet>
    </SafeAreaInsetsContext.Provider>
  </ThemeProvider>
);

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/** What the timing calls asked for, by duration: [duration, easing was given]. */
const durations = () =>
  timing.mock.calls.map((call) => ((call as unknown[])[1] as { duration: number }).duration);

beforeEach(() => {
  jest.useFakeTimers();
  reduced.mockReturnValue(false);
  timing.mockClear();
  jest.mocked(cue).mockClear();
});
afterEach(() => {
  timing.mockImplementation(realTiming as never);
  jest.useRealTimers();
});

describe('Sheet arriving', () => {
  it('dims the page over 320 ms and settles the sheet over 520 ms, its fade in 120', async () => {
    await render(sheet({ visible: true }));
    expect(durations().sort((a, b) => a - b)).toEqual([120, 320, 520]);
  });

  it('is live from the first frame: the words and the button are there and can be pressed', async () => {
    await render(sheet({ visible: true }));
    expect(screen.getByText('Words on the sheet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeEnabled();
  });

  it('under Reduce Motion only fades, 180 ms, and never travels', async () => {
    reduced.mockReturnValue(true);
    await render(sheet({ visible: true }));
    expect(durations().filter((ms) => ms > 0)).toEqual([180, 180]);
    expect(durations()).not.toContain(520);
  });
});

describe('Sheet leaving', () => {
  it('stays for the length of its exit, and then unmounts', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    // Still drawn, and still one of ECHO’s own windows, while it fades.
    const stage = () => screen.queryByTestId('sheet-stage', { includeHiddenElements: true });
    expect(stage()).toBeTruthy();
    expect(ownWindowOpen()).toBe(true);
    // It no longer answers to the sheet’s name, or to Back.
    expect(screen.queryByTestId('sheet')).toBeNull();
    await advance(259);
    expect(stage()).toBeTruthy();
    expect(ownWindowOpen()).toBe(true);
    await advance(1);
    expect(stage()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('lifts away over 240 ms, with the scrim 260', async () => {
    const view = await render(sheet({ visible: true }));
    timing.mockClear();
    await view.rerender(sheet({ visible: false }));
    expect(durations().sort((a, b) => a - b)).toEqual([240, 240, 260]);
  });

  it('is hidden from everyone and cannot be touched while it leaves', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    expect(screen.queryByRole('button', { name: 'Keep it' })).toBeNull();
    expect(
      screen.getByTestId('sheet-stage', { includeHiddenElements: true }).props.pointerEvents,
    ).toBe('none');
  });

  it('a re-open inside the exit cancels the unmount and carries on', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    await advance(120);
    await view.rerender(sheet({ visible: true }));
    await advance(2000);
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeEnabled();
    expect(ownWindowOpen()).toBe(true);
  });

  it('is gone at once, with no animation at all, when told not to animate', async () => {
    const view = await render(sheet({ visible: true, animated: false }));
    expect(timing).not.toHaveBeenCalled();
    await view.rerender(sheet({ visible: false, animated: false }));
    expect(screen.queryByTestId('sheet-stage', { includeHiddenElements: true })).toBeNull();
    expect(ownWindowOpen()).toBe(false);
    expect(timing).not.toHaveBeenCalled();
  });

  it('under Reduce Motion fades out in 140 ms and is gone with it', async () => {
    reduced.mockReturnValue(true);
    const view = await render(sheet({ visible: true }));
    timing.mockClear();
    await view.rerender(sheet({ visible: false }));
    expect(durations()).toEqual([140, 140]);
    await advance(139);
    expect(screen.queryByTestId('sheet-stage', { includeHiddenElements: true })).toBeTruthy();
    await advance(1);
    expect(screen.queryByTestId('sheet-stage', { includeHiddenElements: true })).toBeNull();
  });
});

describe('a sheet handing its words to the next', () => {
  it('stays open, counted once, and fades the new words in over 200 ms instead of rising again', async () => {
    const view = await render(sheet({ visible: true, contentKey: 'one', label: 'First' }));
    timing.mockClear();
    await view.rerender(sheet({ visible: true, contentKey: 'two', label: 'Second' }));
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.queryByText('First')).toBeNull();
    expect(ownWindowOpen()).toBe(true);
    expect(durations()).toEqual([200]);
  });

  it('does not fade words that arrive with the sheet', async () => {
    const view = await render(sheet({ visible: false, contentKey: 'one' }));
    timing.mockClear();
    await view.rerender(sheet({ visible: true, contentKey: 'two' }));
    expect(durations().sort((a, b) => a - b)).toEqual([120, 320, 520]);
  });
});

describe('the sheet’s actions', () => {
  it('commit is felt once when the primary button confirms, and nothing for a quiet word', async () => {
    await render(
      <ThemeProvider crossfade={false}>
        <SafeAreaInsetsContext.Provider value={NO_INSETS}>
          <Sheet
            visible
            onClose={() => undefined}
            footer={
              <>
                <SheetButton label="Keep draft" onPress={() => undefined} />
                <SheetAction label="Cancel" onPress={() => undefined} />
              </>
            }
          >
            <Text>Words</Text>
          </Sheet>
        </SafeAreaInsetsContext.Provider>
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(cue).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep draft' }));
    expect(cue).toHaveBeenCalledTimes(1);
    expect(cue).toHaveBeenCalledWith('commit');
  });
});

describe('a sheet whose animation switches off or whose motion setting changes during its exit', () => {
  const stage = () => screen.queryByTestId('sheet-stage', { includeHiddenElements: true });

  it('is gone when the lock takes the screen mid-exit and then lets it go: no invisible window is left behind', async () => {
    const view = await render(sheet({ visible: true }));
    // It starts to leave...
    await view.rerender(sheet({ visible: false }));
    // ...the lock engages (animated goes false) while it is leaving...
    await view.rerender(sheet({ visible: false, animated: false }));
    expect(stage()).toBeNull();
    // ...and the person unlocks (animated comes back).
    await view.rerender(sheet({ visible: false, animated: true }));
    await advance(1000);
    expect(stage()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('is gone when animation is turned off, held a moment, and back on, before its timer would have fired', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    await advance(100);
    await view.rerender(sheet({ visible: false, animated: false }));
    await view.rerender(sheet({ visible: false, animated: true }));
    expect(stage()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('still unmounts when Reduce Motion is switched on during its exit', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    await advance(100);
    reduced.mockReturnValue(true);
    await view.rerender(sheet({ visible: false }));
    await advance(400);
    expect(stage()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('still unmounts when Reduce Motion is switched off during its exit', async () => {
    reduced.mockReturnValue(true);
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    await advance(50);
    reduced.mockReturnValue(false);
    await view.rerender(sheet({ visible: false }));
    await advance(400);
    expect(stage()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('opens again from nothing after all that: its next entrance is whole', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false, animated: false }));
    await view.rerender(sheet({ visible: false }));
    timing.mockClear();
    await view.rerender(sheet({ visible: true }));
    expect(stage()).toBeTruthy();
    expect(durations().sort((a, b) => a - b)).toEqual([120, 320, 520]);
  });
});

describe('the look of a pressed action', () => {
  const two = (visible: boolean) => (
    <ThemeProvider crossfade={false}>
      <SafeAreaInsetsContext.Provider value={NO_INSETS}>
        <Sheet
          visible={visible}
          onClose={() => undefined}
          testID="sheet"
          footer={
            <>
              <SheetButton label="Keep draft" onPress={() => undefined} />
              <SheetAction label="Cancel" onPress={() => undefined} />
            </>
          }
        >
          <Text>Words</Text>
        </Sheet>
      </SafeAreaInsetsContext.Provider>
    </ThemeProvider>
  );
  const scaleOf = (name: string) =>
    (
      StyleSheet.flatten(screen.getByRole('button', { name, hidden: true }).props.style) as {
        transform?: { scale: number }[];
      }
    ).transform;

  it('is held by the button that was chosen while the sheet leaves', async () => {
    const view = await render(two(true));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep draft' }));
    await view.rerender(two(false));
    expect(scaleOf('Keep draft')).toEqual([{ scale: 0.985 }]);
  });

  it('is not left on a button when the sheet comes back during its exit and leaves another way', async () => {
    const view = await render(two(true));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep draft' }));
    await view.rerender(two(false));
    await view.rerender(two(true));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await view.rerender(two(false));
    // Cancel was the way out this time: Keep draft must not still look pressed.
    expect(scaleOf('Keep draft')).toBeUndefined();
  });
});

describe('a sheet leaving while the screen is busy', () => {
  const stage = () => screen.queryByTestId('sheet-stage', { includeHiddenElements: true });
  type Done = (finished: boolean) => void;

  /** The screen is too busy to draw: no animation finishes until the test lets it. */
  function starve() {
    const waiting: Done[] = [];
    timing.mockImplementation(((value: unknown, _config: unknown, done?: Done) => {
      if (done) waiting.push(done);
      return value;
    }) as never);
    return {
      /** The animation reaches its end at last, and says so to the sheet. */
      finish: () =>
        act(() => {
          waiting.splice(0).forEach((done) => done(true));
        }),
      /** The animation is cut short, as one is by the sheet opening again. */
      cut: () =>
        act(() => {
          waiting.splice(0).forEach((done) => done(false));
        }),
    };
  }

  it('is not taken from the screen while its fade has not been seen: a busy screen delays the fade, never the window', async () => {
    const view = await render(sheet({ visible: true }));
    const screenIs = starve();
    await view.rerender(sheet({ visible: false }));
    // A timer alone would have ended the window at 280 ms, with the sheet still whole on the glass.
    await advance(900);
    expect(stage()).toBeTruthy();
    expect(ownWindowOpen()).toBe(true);
    await screenIs.finish();
    expect(stage()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('still ends the window if the screen never says its fade is done', async () => {
    const view = await render(sheet({ visible: true }));
    starve();
    await view.rerender(sheet({ visible: false }));
    await advance(1000);
    expect(stage()).toBeTruthy();
    await advance(300);
    expect(stage()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('is not ended by a fade that was cut short, and stays open when it comes back', async () => {
    const view = await render(sheet({ visible: true }));
    const screenIs = starve();
    await view.rerender(sheet({ visible: false }));
    await advance(100);
    await view.rerender(sheet({ visible: true }));
    await screenIs.cut();
    await advance(3000);
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(ownWindowOpen()).toBe(true);
  });
});

describe('the window of a sheet that is leaving', () => {
  /** What the window is told, as values: the handlers it is given are the app's own business. */
  const told = () => Object.entries(modalHost()).filter(([, value]) => typeof value !== 'function');

  it('is left exactly as it was: nothing the window is told changes as the sheet fades', async () => {
    // Every update to a Modal on Android runs the window's property pass. An exit that changes the
    // window under a sheet is an exit that can blink.
    const view = await render(sheet({ visible: true }));
    const open = told();
    expect(open).toContainEqual(['visible', true]);
    await view.rerender(sheet({ visible: false }));
    expect(told()).toEqual(open);
  });

  it('still answers to the sheet’s name only while the sheet is open', async () => {
    const view = await render(sheet({ visible: true }));
    expect(screen.getByTestId('sheet')).toBeTruthy();
    await view.rerender(sheet({ visible: false }));
    expect(screen.queryByTestId('sheet')).toBeNull();
  });
});

describe('a sheet over the keyboard', () => {
  const stageStyle = () =>
    StyleSheet.flatten(
      screen.getByTestId('sheet-stage', { includeHiddenElements: true }).props.style,
    ) as { paddingBottom?: number };
  const KEYBOARD = {
    duration: 250,
    endCoordinates: { height: 336, screenY: 516, screenX: 0, width: 393 },
  };
  /** The sheet's own distance from the bottom edge: the safe edge, and 8 pt more. */
  const resting = (bottom: number) => Math.max(bottom, tokens.space[12]) + tokens.space[8];
  const withInsets = (bottom: number, visible = true) => (
    <ThemeProvider crossfade={false}>
      <SafeAreaInsetsContext.Provider value={{ ...NO_INSETS, bottom }}>
        <Sheet
          visible={visible}
          onClose={() => undefined}
          testID="sheet"
          footer={<SheetButton label="Write it" onPress={() => undefined} />}
        >
          <Text>Words</Text>
        </Sheet>
      </SafeAreaInsetsContext.Provider>
    </ThemeProvider>
  );

  it('rises with the keyboard so its button is clear above it', async () => {
    const view = await render(withInsets(34));
    expect(stageStyle().paddingBottom ?? 0).toBe(0);
    await act(async () => {
      DeviceEventEmitter.emit('keyboardWillChangeFrame', KEYBOARD);
    });
    await view.rerender(withInsets(34));
    // iOS reports the keyboard from the bottom edge, safe area included.
    expect(stageStyle().paddingBottom).toBe(336 + tokens.space[8] - resting(34));
  });

  it('comes down again when the keyboard goes', async () => {
    const view = await render(withInsets(34));
    await act(async () => {
      DeviceEventEmitter.emit('keyboardWillChangeFrame', KEYBOARD);
    });
    await act(async () => {
      DeviceEventEmitter.emit('keyboardWillHide', { duration: 250, endCoordinates: { height: 0 } });
    });
    await view.rerender(withInsets(34));
    expect(stageStyle().paddingBottom ?? 0).toBe(0);
  });

  it('on Android adds the bar under the keyboard, which the system leaves out of its height', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const view = await render(withInsets(24));
    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { height: 300, screenY: 500 } });
    });
    await view.rerender(withInsets(24));
    expect(stageStyle().paddingBottom).toBe(300 + 24 + tokens.space[8] - resting(24));
  });

  it('does not move for a keyboard too small to reach it', async () => {
    const view = await render(withInsets(0));
    await act(async () => {
      DeviceEventEmitter.emit('keyboardWillChangeFrame', {
        duration: 250,
        endCoordinates: { height: 4, screenY: 800, screenX: 0, width: 393 },
      });
    });
    await view.rerender(withInsets(0));
    expect(stageStyle().paddingBottom ?? 0).toBe(0);
  });

  it('listens for the keyboard only while its window is there', async () => {
    const heard: { remove: jest.Mock }[] = [];
    const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation((() => {
      const subscription = { remove: jest.fn() };
      heard.push(subscription);
      return subscription;
    }) as never);
    const view = await render(withInsets(0, false));
    expect(listen).not.toHaveBeenCalled();
    await view.rerender(withInsets(0, true));
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.some(({ remove }) => remove.mock.calls.length > 0)).toBe(false);
    await view.rerender(withInsets(0, false));
    await advance(1500);
    expect(heard.every(({ remove }) => remove.mock.calls.length === 1)).toBe(true);
    listen.mockRestore();
  });
});
