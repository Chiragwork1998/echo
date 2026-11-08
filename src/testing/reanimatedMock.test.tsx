// The Reanimated stand-in runs worklets as the UI runtime runs them. This is the guard against the
// walk's crash (v9): every bottom sheet killed the app on Android, because a worklet called a plain
// function ("Tried to synchronously call a Remote Function") and jest, which ran the worklet as an
// ordinary closure, had no way to say so. These tests are for the stand-in itself.
import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { animationClock, uiRuntime } from './reanimatedMock';

// An ordinary function: it is here on the JS thread and nowhere else.
function readFromJs() {
  return 0.5;
}
// A worklet: it goes to the UI runtime with the worklet that calls it.
function clamp(value: number) {
  'worklet';
  return Math.min(1, Math.max(0, value));
}
const TABLE = { rest: 0.25, steps: [0.1, 0.2, 0.3] };

const styleOf = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;

beforeEach(() => {
  jest.useFakeTimers();
  uiRuntime.reset();
  animationClock.reset();
});
afterEach(() => {
  jest.useRealTimers();
  uiRuntime.reset();
  animationClock.reset();
});

describe('worklets on the UI runtime', () => {
  it('stop at a function that is not a worklet, as the app did: the walk’s crash, in jest', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      const style = useAnimatedStyle(() => ({ opacity: readFromJs() }));
      return <Animated.View testID="probe" style={style} />;
    }
    await expect(render(<Probe />)).rejects.toThrow(
      /Tried to synchronously call a Remote Function\. Called "readFromJs" on the UI Runtime/,
    );
  });

  it('stop at a function that a shared value’s worklet reaches through an object', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const helpers = { read: readFromJs };
    function Probe() {
      const style = useAnimatedStyle(() => ({ opacity: helpers.read() }));
      return <Animated.View testID="probe" style={style} />;
    }
    await expect(render(<Probe />)).rejects.toThrow(/Remote Function\. Called "readFromJs"/);
  });

  it('let a worklet use Math, other worklets, shared values, and numbers and tables it was given', async () => {
    function Probe() {
      const shown = useSharedValue(0.8);
      const gap = 2;
      const style = useAnimatedStyle(() => ({
        opacity: clamp(shown.get() * gap),
        top: TABLE.steps[1]! + TABLE.rest,
      }));
      return <Animated.View testID="probe" style={style} />;
    }
    await render(<Probe />);
    expect(styleOf('probe')).toEqual({ opacity: 1, top: 0.45 });
    expect(uiRuntime.ran).toBeGreaterThan(0);
  });

  it('take a number worked out on the JS thread, which is how a function that is not a worklet is used', async () => {
    function Probe() {
      const reserved = readFromJs();
      const style = useAnimatedStyle(() => ({ opacity: reserved }));
      return <Animated.View testID="probe" style={style} />;
    }
    await render(<Probe />);
    expect(styleOf('probe').opacity).toBe(0.5);
  });

  it('go back to JS with runOnJS, which is the way for a worklet to reach a function that is not one', async () => {
    const heard = jest.fn();
    function Probe() {
      const place = useSharedValue(0);
      useAnimatedReaction(
        () => Math.round(place.get()),
        (now, was) => {
          if (now !== was) runOnJS(heard)(now);
        },
      );
      return <Text onPress={() => place.set(3)}>move</Text>;
    }
    await render(<Probe />);
    heard.mockClear();
    await act(async () => screen.getByText('move').props.onPress());
    expect(heard).toHaveBeenCalledWith(3);
  });

  it('run an animation’s callback on the UI runtime: a worklet may reach JS only through runOnJS', async () => {
    const done = jest.fn();
    function Probe() {
      const shown = useSharedValue(0);
      shown.set(
        withTiming(1, { duration: 100 }, (finished) => {
          'worklet';
          if (finished) runOnJS(done)();
        }),
      );
      return null;
    }
    await render(<Probe />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('refuse an animation’s callback that is not a worklet, when the animation ends', async () => {
    // Held in an object, so that the Babel plugin does not make it a worklet by reference.
    const handlers = {
      finish() {
        return undefined;
      },
    };
    function Probe() {
      const shown = useSharedValue(0);
      shown.set(withTiming(1, { duration: 100 }, handlers.finish));
      return null;
    }
    await render(<Probe />);
    expect(() => jest.advanceTimersByTime(150)).toThrow(/Remote Function\. Called "finish"/);
  });

  it('keep a derived value’s worklet to the same rule', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      const derived = useDerivedValue(() => readFromJs());
      return <Text>{String(derived.get())}</Text>;
    }
    await expect(render(<Probe />)).rejects.toThrow(/Remote Function\. Called "readFromJs"/);
  });

  it('can be switched off, which brings back the old behaviour of a worklet as a plain closure', async () => {
    uiRuntime.enabled = false;
    function Probe() {
      const style = useAnimatedStyle(() => ({ opacity: readFromJs() }));
      return <Animated.View testID="probe" style={style} />;
    }
    await render(<Probe />);
    expect(styleOf('probe').opacity).toBe(0.5);
    expect(uiRuntime.ran).toBe(0);
  });
});

describe('runOnJS', () => {
  it('delivers late, and in order, when the JS thread is busy', async () => {
    animationClock.jsLag = 50;
    const heard: number[] = [];
    runOnJS((value: number) => heard.push(value))(1);
    runOnJS((value: number) => heard.push(value))(2);
    expect(heard).toEqual([]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(49);
    });
    expect(heard).toEqual([]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2);
    });
    expect(heard).toEqual([1, 2]);
  });
});

describe('an animated view’s styles', () => {
  it('may not change after it was first drawn: a style that arrives late brings the view none of its first values', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe({ glass }: { glass: boolean }) {
      const shown = useSharedValue(0);
      const plain = useAnimatedStyle(() => ({ opacity: shown.get() }));
      const whole = useAnimatedStyle(() => ({ opacity: shown.get() > 0 ? 1 : 0 }));
      return <Animated.View testID="probe" style={glass ? whole : plain} />;
    }
    const view = await render(<Probe glass={false} />);
    await expect(view.rerender(<Probe glass />)).rejects.toThrow(
      /its animated styles changed after it was first drawn/,
    );
  });

  it('may follow what it captures instead: one style for its life, and what it says may change', async () => {
    function Probe({ glass }: { glass: boolean }) {
      const shown = useSharedValue(0);
      const style = useAnimatedStyle(() => ({ opacity: glass ? (shown.get() > 0 ? 1 : 0) : 0.3 }));
      return <Animated.View testID="probe" style={style} />;
    }
    const view = await render(<Probe glass={false} />);
    expect(styleOf('probe').opacity).toBe(0.3);
    await view.rerender(<Probe glass />);
    expect(styleOf('probe').opacity).toBe(0);
  });

  it('may have a plain style come and go beside its animated one', async () => {
    function Probe({ on }: { on: boolean }) {
      const shown = useSharedValue(1);
      const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
      return <Animated.View testID="probe" style={[on && { top: 4 }, style]} />;
    }
    const view = await render(<Probe on={false} />);
    await view.rerender(<Probe on />);
    expect(styleOf('probe')).toEqual({ top: 4, opacity: 1 });
  });
});
