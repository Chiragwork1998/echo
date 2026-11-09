import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DeviceEventEmitter, Dimensions, Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { cue } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { qaKeyboardHeight } from '@/features/journal-session/sky';
import { ownWindowOpen } from '@/state/ownWindows';
import { layOutSheet, modalHost } from '@/testing/dialogs';
import { animationClock, reanimatedMock, uiRuntime } from '@/testing/reanimatedMock';

import { KEYS_SETTLE_MS, Sheet, SheetAction, SheetButton } from './Sheet';

jest.mock('@/design/haptics');
jest.mock('@/design/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }));
// The visual harness reserves the room of a keyboard by name: an ordinary function, which is what the
// sheet's worklet must not call (see 'a sheet on the UI thread').
jest.mock('@/features/journal-session/sky', () => ({
  ...jest.requireActual('@/features/journal-session/sky'),
  qaKeyboardHeight: jest.fn(() => 0),
}));

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
  jest.mocked(qaKeyboardHeight).mockReturnValue(0);
  uiRuntime.ran = 0;
});
afterEach(() => {
  timing.mockImplementation(realTiming as never);
  animationClock.reset();
  jest.useRealTimers();
});

describe('Sheet arriving', () => {
  it('dims the page over 320 ms and settles the sheet over 520 ms, its fade in 120', async () => {
    await render(sheet({ visible: true }));
    await layOutSheet('sheet');
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
    await layOutSheet('sheet');
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
    await layOutSheet('sheet');
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
    await layOutSheet('sheet');
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

describe('a sheet on the UI thread', () => {
  // The walk (v9): every bottom sheet killed the app on Android ("Tried to synchronously call a
  // Remote Function"). The ground's worklet called qaKeyboardHeight(), a plain function, and a
  // worklet runs on the UI thread, where a function that is not a worklet cannot be called.
  const stage = () =>
    StyleSheet.flatten(
      screen.getByTestId('sheet-stage', { includeHiddenElements: true }).props.style,
    ) as { paddingBottom?: number };

  it('works out its ground there without calling anything that is not a worklet', async () => {
    await render(sheet({ visible: true }));
    // Its styles were run as the UI runtime runs them, and nothing in them threw.
    expect(uiRuntime.ran).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeEnabled();
    expect(stage().paddingBottom ?? 0).toBe(0);
  });

  it('is given the room the harness reserves for a keyboard as a number, drawn with the sheet', async () => {
    jest.mocked(qaKeyboardHeight).mockReturnValue(300);
    await render(sheet({ visible: true }));
    // 300 for the keyboard and the gap above it, less the sheet's own distance from the edge.
    expect(stage().paddingBottom).toBe(
      300 + tokens.space[8] - (tokens.space[12] + tokens.space[8]),
    );
  });
});

// The walk (v10): three sheets were drawn for the first time already part of the way up, or whole.
// "Delete this echo" came in opaque and above its place, "Delete all data" faint and above it, and "If
// you are struggling" with its scrim in one frame. A Modal's window is made by the system after the
// commit, and laid out at nothing before it is given its size; an arrival timed from the commit has
// spent that time when the window is first drawn, so the first frame was the middle or the end of it.
// A sheet's first drawn frame is its start (invisible, 24 pt low, the page undimmed), whenever that
// frame is, and it rises from there once the window has been laid out.
describe('the first frame a sheet is drawn in', () => {
  const FRAME = 16;
  type Look = { opacity?: number; transform?: { translateY: number }[] };
  const look = (id: string) =>
    StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style) as Look;
  /** The sheet and the scrim, as drawn now: opacity, and how far below its place the sheet is. */
  const drawn = () => ({
    sheet: look('sheet-paper').opacity,
    low: look('sheet-paper').transform?.[0]?.translateY,
    scrim: look('sheet-scrim').opacity,
  });
  const START = { sheet: 0, low: 24, scrim: 0 };

  beforeEach(() => {
    animationClock.stepped = true;
  });

  /** Draws the sheet each frame for as long as asked, and says what each frame showed. */
  async function frames(
    view: { rerender: (element: React.ReactElement) => unknown },
    count: number,
  ) {
    const seen: ReturnType<typeof drawn>[] = [];
    for (let frame = 0; frame < count; frame += 1) {
      await advance(FRAME);
      await view.rerender(sheet({ visible: true }));
      seen.push(drawn());
    }
    return seen;
  }

  it('is the start state, however late the window is first drawn', async () => {
    const view = await render(sheet({ visible: true }));
    // The system takes its time over the window: half a second before anything of it is drawn.
    await advance(500);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual(START);
  });

  it('rises from the start state once the window has been laid out, and is not whole in its first frame', async () => {
    const view = await render(sheet({ visible: true }));
    await advance(500);
    await view.rerender(sheet({ visible: true }));
    await layOutSheet('sheet');
    const seen = await frames(view, 45);
    // Its first frame after the layout is part of the way, not the end.
    expect(seen[0]!.sheet).toBeLessThan(1);
    expect(seen[0]!.scrim).toBeLessThan(0.2);
    expect(seen[0]!.low).toBeGreaterThan(0);
    // And it comes in steadily: the sheet fades up and rises, the page dims, none going back.
    const opacity = seen.map(({ sheet: value }) => value ?? 0);
    expect(opacity).toEqual([...opacity].sort((a, b) => a - b));
    const low = seen.map(({ low: value }) => value ?? 0);
    expect(low).toEqual([...low].sort((a, b) => b - a));
    expect(seen.at(-1)).toEqual({ sheet: 1, low: 0, scrim: 1 });
  });

  it('is not begun by a layout of nothing: the window is laid out at no size before it has its own', async () => {
    const view = await render(sheet({ visible: true }));
    await fireEvent(screen.getByTestId('sheet-stage'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 0 } },
    });
    await advance(200);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual(START);
  });

  it('is never left invisible: it arrives anyway if the window never says it was laid out', async () => {
    const view = await render(sheet({ visible: true }));
    await advance(500);
    await view.rerender(sheet({ visible: true }));
    await advance(1000);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual({ sheet: 1, low: 0, scrim: 1 });
  });

  it('starts again from nothing for a sheet that opens after being closed (Support, from You)', async () => {
    const view = await render(sheet({ visible: false }));
    await view.rerender(sheet({ visible: true }));
    await advance(500);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual(START);
    await layOutSheet('sheet');
    await advance(1000);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual({ sheet: 1, low: 0, scrim: 1 });
    // Closed, gone, and opened a second time: the window is a new one, and its first frame is the start.
    await view.rerender(sheet({ visible: false }));
    await advance(1500);
    await view.rerender(sheet({ visible: false }));
    await view.rerender(sheet({ visible: true }));
    await advance(500);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual(START);
    await layOutSheet('sheet');
    const seen = await frames(view, 45);
    expect(seen[0]!.sheet).toBeLessThan(1);
    expect(seen.at(-1)).toEqual({ sheet: 1, low: 0, scrim: 1 });
  });

  it('under Reduce Motion is invisible first, and fades without travelling', async () => {
    reduced.mockReturnValue(true);
    const view = await render(sheet({ visible: true }));
    await advance(500);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual({ sheet: 0, low: 0, scrim: 0 });
    await layOutSheet('sheet');
    await advance(1000);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual({ sheet: 1, low: 0, scrim: 1 });
  });

  it('leaves as it always did when it is closed before it was ever laid out', async () => {
    const view = await render(sheet({ visible: true }));
    await view.rerender(sheet({ visible: false }));
    await advance(1400);
    expect(screen.queryByTestId('sheet-stage', { includeHiddenElements: true })).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });
});

// The walk (v11): "Delete this echo?" and "If you are struggling" were first drawn faint and about 53 dp
// above their place, then about 20 dp below it, before rising. Android lays a Modal out first at a size
// it works out from the app's window less its bars (840 points of a 914-point window on the walked
// emulator), and then at the window's own size; the sheet, which sits at the window's foot, began to
// arrive on the first and dropped 74 points with the second. It begins only once the window is its own
// size, which, edge to edge, is the whole of the app's window.
describe('a sheet’s window on Android, laid out first at a guess', () => {
  const FRAME = 16;
  const WINDOW = { width: 411, height: 914.2857, scale: 2.625, fontScale: 1 };
  type Look = { opacity?: number; transform?: { translateY: number }[] };
  const look = (id: string) =>
    StyleSheet.flatten(screen.getByTestId(id, { includeHiddenElements: true }).props.style) as Look;
  const drawn = () => ({
    sheet: look('sheet-paper').opacity,
    low: look('sheet-paper').transform?.[0]?.translateY,
    scrim: look('sheet-scrim').opacity,
  });
  const START = { sheet: 0, low: 24, scrim: 0 };
  const AT_REST = { sheet: 1, low: 0, scrim: 1 };
  const layOut = (height: number) =>
    fireEvent(screen.getByTestId('sheet-stage', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: WINDOW.width, height } },
    });
  async function frames(
    view: { rerender: (element: React.ReactElement) => unknown },
    count: number,
  ) {
    const seen: ReturnType<typeof drawn>[] = [];
    for (let frame = 0; frame < count; frame += 1) {
      await advance(FRAME);
      await view.rerender(sheet({ visible: true }));
      seen.push(drawn());
    }
    return seen;
  }

  let restore: () => void;
  beforeEach(() => {
    animationClock.stepped = true;
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    const dimensions = jest.spyOn(Dimensions, 'get').mockReturnValue(WINDOW);
    restore = () => {
      dimensions.mockRestore();
      platform.restore();
    };
  });
  afterEach(() => restore());

  it('does not begin on the first guess, and arrives from its start once the window is its own size', async () => {
    const view = await render(sheet({ visible: true }));
    await layOut(840);
    // The window is drawn at the guess for a frame or two: nothing of the sheet is in it yet.
    for (const frame of await frames(view, 6)) expect(frame).toEqual(START);
    await layOut(WINDOW.height);
    const seen = await frames(view, 45);
    expect(seen[0]!.sheet).toBeLessThan(1);
    expect(seen[0]!.low).toBeGreaterThan(0);
    // And it only rises: never above its place, never dropping back below where it was.
    const low = seen.map(({ low: value }) => value ?? 0);
    expect(low).toEqual([...low].sort((a, b) => b - a));
    expect(Math.min(...low)).toBe(0);
    expect(seen.at(-1)).toEqual(AT_REST);
  });

  it('waits the same way with the keys up: they pad the stage, and never change its height', async () => {
    const view = await render(sheet({ visible: true }));
    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { height: 312, screenY: 600 } });
    });
    await layOut(840);
    for (const frame of await frames(view, 6)) expect(frame).toEqual(START);
    await layOut(WINDOW.height);
    const seen = await frames(view, 45);
    expect(seen[0]!.low).toBeGreaterThan(0);
    expect(seen.at(-1)).toEqual(AT_REST);
    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidHide', { endCoordinates: { height: 0 } });
    });
  });

  it('arrives on its first layout when that is already the whole window', async () => {
    const view = await render(sheet({ visible: true }));
    await layOut(WINDOW.height - 0.5);
    const seen = await frames(view, 3);
    expect(seen.at(-1)!.low).toBeLessThan(START.low);
  });

  it('takes a second size as the window’s own, though it is not the whole window (a split screen)', async () => {
    const view = await render(sheet({ visible: true }));
    await layOut(840);
    await layOut(452);
    const seen = await frames(view, 45);
    expect(seen[0]!.low).toBeGreaterThan(0);
    expect(seen.at(-1)).toEqual(AT_REST);
  });

  it('arrives anyway, a little late, if the window never says more than its guess', async () => {
    const view = await render(sheet({ visible: true }));
    await layOut(840);
    await advance(300);
    await view.rerender(sheet({ visible: true }));
    expect(drawn()).toEqual(START);
    await advance(150);
    const seen = await frames(view, 45);
    expect(seen.at(-1)).toEqual(AT_REST);
  });

  it('waits for the next window’s own size too, when it opens again', async () => {
    const view = await render(sheet({ visible: true }));
    await layOut(840);
    await layOut(WINDOW.height);
    await advance(1000);
    await view.rerender(sheet({ visible: false }));
    await advance(1500);
    await view.rerender(sheet({ visible: false }));
    await view.rerender(sheet({ visible: true }));
    await layOut(840);
    for (const frame of await frames(view, 6)) expect(frame).toEqual(START);
  });
});

// The walk (v10), the name sheet: on "Write it" the sheet re-laid out into its named state mid-exit (a
// "Remove my name" row appeared) and jumped up about 120 px as it faded, and the keyboard stayed over
// You for 350 ms after the sheet had gone. A sheet that is leaving shows what it showed when it left,
// stays where it was, and the keyboard goes as the exit begins.
describe('a sheet leaving over the keyboard', () => {
  const KEYBOARD = {
    duration: 250,
    endCoordinates: { height: 336, screenY: 516, screenX: 0, width: 393 },
  };
  const stageStyle = () =>
    StyleSheet.flatten(
      screen.getByTestId('sheet-stage', { includeHiddenElements: true }).props.style,
    ) as { paddingBottom?: number };
  const named = (visible: boolean, name: string | null) => (
    <ThemeProvider crossfade={false}>
      <SafeAreaInsetsContext.Provider value={NO_INSETS}>
        <Sheet
          visible={visible}
          onClose={() => undefined}
          testID="sheet"
          footer={
            <>
              <SheetButton label="Write it" onPress={() => undefined} />
              {name ? <SheetAction label="Remove my name" onPress={() => undefined} /> : null}
            </>
          }
        >
          <Text>{name ? `Named ${name}` : 'Not named'}</Text>
        </Sheet>
      </SafeAreaInsetsContext.Provider>
    </ThemeProvider>
  );
  // iOS says it before the keyboard moves, Android after.
  const ios = () => Platform.OS === 'ios';
  const keyboardUp = () =>
    act(async () => {
      DeviceEventEmitter.emit(ios() ? 'keyboardWillChangeFrame' : 'keyboardDidShow', KEYBOARD);
    });
  const keyboardAway = () =>
    act(async () => {
      DeviceEventEmitter.emit(ios() ? 'keyboardWillHide' : 'keyboardDidHide', {
        duration: 250,
        endCoordinates: { height: 0 },
      });
    });
  let dismiss: jest.SpyInstance;
  beforeEach(() => {
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
  });
  afterEach(() => dismiss.mockRestore());

  it('shows what it showed when it left: nothing is added to it, or taken from it, as it fades', async () => {
    const view = await render(named(true, null));
    // The name is written as the sheet closes, and the sheet is told about it in the same breath.
    await view.rerender(named(false, 'Quorvenel'));
    expect(screen.queryByText('Not named', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Named Quorvenel', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Remove my name', { includeHiddenElements: true })).toBeNull();
    await advance(120);
    await view.rerender(named(false, 'Quorvenel'));
    expect(screen.queryByText('Remove my name', { includeHiddenElements: true })).toBeNull();
  });

  it('shows what is true the next time it opens', async () => {
    const view = await render(named(true, null));
    await view.rerender(named(false, 'Quorvenel'));
    await advance(1500);
    await view.rerender(named(true, 'Quorvenel'));
    expect(screen.getByText('Named Quorvenel')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove my name' })).toBeTruthy();
  });

  it('puts the keyboard away before the exit begins, when the sheet raised it', async () => {
    const view = await render(named(true, null));
    await keyboardUp();
    timing.mockClear();
    await view.rerender(named(false, null));
    expect(dismiss).toHaveBeenCalledTimes(1);
    // Before the sheet's own fade and sink are asked for.
    expect(dismiss.mock.invocationCallOrder[0]!).toBeLessThan(timing.mock.invocationCallOrder[0]!);
  });

  it('leaves the keyboard alone when the sheet did not raise it: the page’s own stays for the page', async () => {
    const view = await render(named(true, null));
    await view.rerender(named(false, null));
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('puts the keyboard away once: not again for a keyboard already on its way out', async () => {
    const view = await render(named(true, null));
    await keyboardUp();
    await view.rerender(named(false, null));
    await keyboardAway();
    await view.rerender(named(false, null));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps its ground where it was while it leaves: the keyboard going lays nothing out again', async () => {
    const view = await render(named(true, null));
    await keyboardUp();
    await view.rerender(named(true, null));
    const raised = stageStyle().paddingBottom;
    expect(raised).toBeGreaterThan(0);
    await view.rerender(named(false, null));
    await keyboardAway();
    await advance(100);
    await view.rerender(named(false, null));
    expect(stageStyle().paddingBottom).toBe(raised);
  });

  // The walk (v11), a name written on You: the sheet and its keys left together, You was whole, and then
  // the keyboard came back over You, whole, for two frames as the sheet's window went. The system goes
  // on putting the keys away after they have been seen to go, and a window taken away meanwhile handed
  // them back. The window stays, invisible and untouchable, until the keys have gone and a moment more.
  const window = () => screen.queryByTestId('sheet-stage', { includeHiddenElements: true });
  const gone = () =>
    act(async () => {
      DeviceEventEmitter.emit('keyboardDidHide', { endCoordinates: { height: 0 } });
    });

  it('keeps its window until the keyboard it put away has gone, and a moment more', async () => {
    const view = await render(named(true, null));
    await keyboardUp();
    await view.rerender(named(false, 'Quorvenel'));
    // The exit has faded, and the keys have not said they have gone.
    await advance(600);
    expect(window()).toBeTruthy();
    expect(ownWindowOpen()).toBe(true);
    await gone();
    await advance(KEYS_SETTLE_MS - 20);
    expect(window()).toBeTruthy();
    await advance(40);
    expect(window()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('waits for its fade too, when the keys are gone first', async () => {
    // A UI thread half a second late: the scrim reaches nothing long after the keys have gone.
    animationClock.lag = 500;
    const view = await render(named(true, null));
    await keyboardUp();
    await view.rerender(named(false, null));
    await gone();
    await advance(KEYS_SETTLE_MS + 100);
    expect(window()).toBeTruthy();
    await advance(500);
    expect(window()).toBeNull();
  });

  it('is taken away at last, however long the keyboard takes to say it has gone', async () => {
    const view = await render(named(true, null));
    await keyboardUp();
    await view.rerender(named(false, null));
    await advance(1250);
    expect(window()).toBeNull();
    expect(ownWindowOpen()).toBe(false);
  });

  it('goes with its fade when it raised no keyboard, as it always has', async () => {
    const view = await render(named(true, null));
    await view.rerender(named(false, null));
    await advance(270);
    expect(window()).toBeNull();
  });

  it('stays, and stays open, if it comes back while it waits for the keys', async () => {
    const view = await render(named(true, null));
    await keyboardUp();
    await view.rerender(named(false, null));
    await advance(400);
    await view.rerender(named(true, null));
    await gone();
    await advance(2000);
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Write it' })).toBeEnabled();
  });

  it('catches up with the keyboard if it comes back during its exit', async () => {
    const view = await render(named(true, null));
    await keyboardUp();
    await view.rerender(named(false, null));
    await keyboardAway();
    await advance(100);
    await view.rerender(named(true, null));
    await advance(300);
    await view.rerender(named(true, null));
    expect(stageStyle().paddingBottom ?? 0).toBe(0);
  });
});
