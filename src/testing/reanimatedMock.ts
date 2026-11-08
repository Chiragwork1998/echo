// Reanimated's bundled mock runs native initialisers and throws under jest-expo. This covers the
// API the app uses and resolves every animation to its final value immediately. If a test needs
// another function, add it here.
//
// Animations that are given a completion callback (withTiming's third argument) are timed too, so
// that the code which follows an animation, not the clock, can be tested: the value still jumps to
// where it is going, and the callback runs once the animation's own time has passed, as jest's
// timers move it. `animationClock` says how:
//   lag      the UI thread is this many ms late in finishing every timed animation (a slow device).
//   stepped  values walk to where they are going, every 16 ms and in a straight line, instead of
//            jumping there, and useAnimatedReaction sees each step. Without it a reaction sees the
//            animation's end at once. Either way a style is only read when the screen is drawn.
import { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

const identity = <T>(value: T) => value;

type Callback = (finished?: boolean) => void;
type Animation = {
  __animation: true;
  to: number;
  duration: number;
  delay: number;
  callback?: Callback;
};
type Mock = {
  value: unknown;
  get(): unknown;
  set(next: unknown): void;
  running?: { stop: () => void; callback?: Callback };
};

/** How the stand-in plays the animations that carry a callback. Tests change it, and `reset` it. */
export const animationClock = {
  lag: 0,
  stepped: false,
  reset() {
    this.lag = 0;
    this.stepped = false;
  },
};
const FRAME_MS = 16;

const isAnimation = (value: unknown): value is Animation =>
  typeof value === 'object' && value !== null && '__animation' in value;

// A reaction runs when a value it prepares from moves, as in Reanimated (which reads them from the
// closure; here, from what `prepare` reads). `react` runs at each of those moments, whether or not what
// was prepared has changed, with what was prepared last time (null at first).
type Reaction = {
  prepare: () => unknown;
  react: (now: unknown, before: unknown) => void;
  last: unknown;
  first: boolean;
  inputs: Set<Mock>;
};
const reactions = new Set<Reaction>();
let reading = false;
let collecting: Set<Mock> | null = null;
function read(reaction: Reaction) {
  const inputs = new Set<Mock>();
  collecting = inputs;
  let now: unknown;
  try {
    now = reaction.prepare();
  } finally {
    collecting = null;
  }
  reaction.inputs = inputs;
  const before = reaction.first ? null : reaction.last;
  reaction.first = false;
  reaction.last = now;
  reaction.react(now, before);
}
function settle(moved: Mock) {
  if (reading) return;
  reading = true;
  try {
    for (const reaction of [...reactions]) if (reaction.inputs.has(moved)) read(reaction);
  } finally {
    reading = false;
  }
}

function later(task: () => void, ms: number) {
  const id = setTimeout(task, ms);
  (id as { unref?: () => void }).unref?.();
  return id;
}

function stopRunning(mock: Mock) {
  const running = mock.running;
  if (!running) return;
  mock.running = undefined;
  running.stop();
  running.callback?.(false);
}

function begin(mock: Mock, animation: Animation) {
  stopRunning(mock);
  const { to, duration, delay, callback } = animation;
  const wait = delay + animationClock.lag;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const running = {
    callback,
    stop: () => {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
  mock.running = running;
  const done = () => {
    if (mock.running !== running) return;
    mock.running = undefined;
    mock.value = to;
    settle(mock);
    callback?.(true);
  };
  if (!animationClock.stepped) {
    mock.value = to;
    settle(mock);
    timers.add(later(done, wait + duration));
    return;
  }
  const from = mock.value as number;
  let elapsed = 0;
  const step = () => {
    elapsed += FRAME_MS;
    const progress = Math.min(1, Math.max(0, (elapsed - wait) / duration));
    if (progress >= 1) return done();
    mock.value = from + (to - from) * progress;
    settle(mock);
    timers.add(later(step, FRAME_MS));
  };
  timers.add(later(step, FRAME_MS));
}

function makeSharedValue<T>(initial: T) {
  const mock: Mock = {
    value: initial,
    get() {
      collecting?.add(this);
      return this.value;
    },
    set(next: unknown) {
      if (isAnimation(next)) return begin(this, next);
      stopRunning(this);
      this.value = next;
      settle(this);
    },
  };
  return mock as Mock & { value: T; get(): T; set(next: T): void };
}

const useSharedValue = <T>(initial: T) => useState(() => makeSharedValue(initial))[0];

/** The keyboard's height, for the one hook that reads it: tests move it with `keyboard.set(…)`. */
export const keyboard = makeSharedValue(0);

const timed = (to: number, config?: { duration?: number }, callback?: Callback) =>
  callback || animationClock.stepped
    ? ({
        __animation: true,
        to,
        duration: config?.duration ?? 300,
        delay: 0,
        callback,
      } satisfies Animation)
    : to;

const delayed = (ms: number, value: unknown) =>
  isAnimation(value) ? { ...value, delay: value.delay + ms } : value;

export const reanimatedMock = {
  __esModule: true,
  default: { View, Text, Image, ScrollView, createAnimatedComponent: identity },
  createAnimatedComponent: identity,
  useSharedValue,
  useDerivedValue: (compute: () => unknown) => ({ value: compute(), get: compute }),
  useAnimatedStyle: (compute: () => object) => compute(),
  useAnimatedProps: (compute: () => object) => compute(),
  useReducedMotion: () => false,
  useAnimatedKeyboard: () => ({ height: keyboard, state: { value: 0, get: () => 0 } }),
  useAnimatedReaction: (prepare: () => unknown, react: (now: unknown, before: unknown) => void) => {
    const latest = useRef({ prepare, react });
    useEffect(() => {
      latest.current = { prepare, react };
    });
    useEffect(() => {
      const reaction: Reaction = {
        prepare: () => latest.current.prepare(),
        react: (now, before) => latest.current.react(now, before),
        last: null,
        first: true,
        inputs: new Set(),
      };
      reactions.add(reaction);
      read(reaction);
      return () => void reactions.delete(reaction);
    }, []);
  },
  withTiming: timed,
  withSpring: identity,
  withDelay: delayed,
  withRepeat: identity,
  withSequence: (...values: unknown[]) => {
    const last = values.at(-1);
    if (!isAnimation(last)) return last;
    const before = values
      .slice(0, -1)
      .reduce<number>(
        (sum, value) => sum + (isAnimation(value) ? value.delay + value.duration : 0),
        0,
      );
    return delayed(before, last);
  },
  cancelAnimation: (value?: Mock) => value && stopRunning(value),
  runOnJS: identity,
  runOnUI: identity,
  interpolate: (_value: number, _input: number[], output: number[]) => output[0],
  interpolateColor: (_value: number, _input: number[], output: string[]) => output[0],
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: {
    linear: identity,
    ease: identity,
    quad: identity,
    cubic: identity,
    sin: identity,
    in: identity,
    out: identity,
    inOut: identity,
    bezier: () => identity,
  },
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
};
