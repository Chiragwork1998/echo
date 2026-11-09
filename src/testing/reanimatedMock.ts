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
//   silent   the UI thread begins every animation but never says that one has ended: the callbacks
//            of animations that last more than a millisecond are never run. (An animation of a
//            millisecond says it has begun, which is how the app learns that the UI thread has picked
//            it up.)
//   jsLag    what the UI thread hands to JS through runOnJS arrives this many ms late (a busy JS
//            thread), in the order it was sent.
// The lag is a UI thread that is late to begin as well as late to end: it starts every animation `lag`
// ms after it was asked, which is how a slow phone was measured (1.8 to 2.1 s late to begin).
//
// Worklets do not run here as plain JS. Under Reanimated each one is copied to the UI runtime, a
// second JavaScript engine, with the variables it uses; a function that is not a worklet cannot go
// along, and calling it from the UI runtime kills the app ("Tried to synchronously call a Remote
// Function", which every bottom sheet did on Android while jest was green, because here the worklet
// was just a closure and could call anything). So `useAnimatedStyle`, `useAnimatedProps`,
// `useDerivedValue`, `useAnimatedReaction` and the callbacks of animations run the worklet the way
// the UI runtime does: from the code the Babel plugin compiled it to, in a context of its own that
// holds only what a worklet's variables bring, where a function that is not a worklet throws the
// same error. `uiRuntime.enabled = false` brings the old closure behaviour back.
import { createElement, useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import vm from 'vm';

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
  silent: false,
  jsLag: 0,
  reset() {
    this.lag = 0;
    this.stepped = false;
    this.silent = false;
    this.jsLag = 0;
  },
};
const FRAME_MS = 16;

/** How the stand-in runs worklets. Tests change it, and `reset` it. */
export const uiRuntime = {
  /** Worklets run as the UI runtime runs them (see the head of this file). */
  enabled: true,
  /**
   * An animated view keeps the animated styles it was first drawn with. Reanimated gives a view the
   * first values of the styles it has when it mounts, and for a style that arrives later it gives
   * the view none: the view is drawn plain (full opacity) until the UI thread has its first word.
   * So swapping one animated style for another, mid-life, flashes, and is thrown here.
   */
  guardStyles: true,
  /** How many worklet runs the stand-in has made: a test that means to check one sees this move. */
  ran: 0,
  reset() {
    this.enabled = true;
    this.guardStyles = true;
    this.ran = 0;
  },
};

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

// ---- The UI runtime ------------------------------------------------------------------------------

type AnyFunction = (...args: never[]) => unknown;
type Worklet = AnyFunction & {
  __workletHash: number;
  __closure: unknown;
  __initData: { code: string };
};

const isWorklet = (value: unknown): value is Worklet =>
  typeof value === 'function' &&
  typeof (value as Partial<Worklet>).__workletHash === 'number' &&
  typeof (value as Partial<Worklet>).__initData?.code === 'string';

/** Things that are the UI runtime's own: shared values and derived values travel to it as they are. */
const uiOwned = new WeakSet<object>();
// Some tests stand a shared value in with no more than a `get`; that is still a shared value.
const isSharedLike = (value: object) => typeof (value as { get?: unknown }).get === 'function';

const REMOTE = Symbol('remote function');

/** What a function that is not a worklet becomes on the UI runtime: a name that throws when called. */
function remoteFunction(fn: AnyFunction) {
  const name = fn.name || 'anonymous';
  const stub = function remote() {
    throw new Error(
      `[Worklets] Tried to synchronously call a Remote Function. Called "${name}" on the UI Runtime. ` +
        `It is not a worklet. Work out plain values at render and capture them, or hand the call to ` +
        `JS with runOnJS.`,
    );
  };
  Object.defineProperty(stub, REMOTE, { value: fn });
  return stub;
}

/** Reanimated's own functions and namespaces: they exist on the UI runtime already. */
function reanimatedApi() {
  const own = new Set<unknown>();
  const walk = (value: unknown, depth: number) => {
    if (own.has(value) || value === null) return;
    if (typeof value !== 'function' && typeof value !== 'object') return;
    own.add(value);
    if (depth < 3 && typeof value === 'object') {
      for (const inner of Object.values(value)) walk(inner, depth + 1);
    }
  };
  walk(reanimatedMock, 0);
  return own;
}

const isPlain = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};

/** What a worklet's variable becomes on the UI runtime: copied, with functions turned to what they are. */
function toUI(value: unknown, api: Set<unknown>, seen: Map<unknown, unknown>, depth = 0): unknown {
  if (typeof value === 'function') {
    if (api.has(value)) return value;
    if (isWorklet(value)) return onUI(value);
    return seen.get(value) ?? seen.set(value, remoteFunction(value as AnyFunction)).get(value);
  }
  if (value === null || typeof value !== 'object') return value;
  if (api.has(value) || uiOwned.has(value) || isSharedLike(value)) return value;
  if (seen.has(value)) return seen.get(value);
  // A React element, an instance of a class: not the plain data a worklet is given.
  if (depth > 6 || '$$typeof' in value) return value;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(toUI(item, api, seen, depth + 1));
    return copy;
  }
  if (!isPlain(value)) return value;
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) copy[key] = toUI(item, api, seen, depth + 1);
  return copy;
}

/** What the UI runtime hands back, written again in this realm so that the tests can compare it. */
function fromUI(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (uiOwned.has(value) || isSharedLike(value)) return value;
  if (Array.isArray(value)) return value.map(fromUI);
  if (!isPlain(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fromUI(item)]));
}

let uiContext: vm.Context | undefined;
const compiled = new Map<string, (this: unknown, ...args: unknown[]) => unknown>();
const wrapped = new WeakMap<object, (...args: unknown[]) => unknown>();

/**
 * A worklet as the UI runtime has it: its compiled code, run in a context that has none of this
 * file's or the screen's variables, only what the worklet carries (its closure, copied as above).
 */
function onUI(worklet: Worklet): (...args: unknown[]) => unknown {
  const known = wrapped.get(worklet);
  if (known) return known;
  const run = function (this: unknown, ...args: unknown[]) {
    uiRuntime.ran += 1;
    uiContext ??= vm.createContext({ console, _WORKLET: true });
    const { code } = worklet.__initData;
    let body = compiled.get(code);
    if (!body) {
      body = vm.runInContext(code, uiContext) as (this: unknown, ...args: unknown[]) => unknown;
      compiled.set(code, body);
    }
    const api = reanimatedApi();
    const seen = new Map<unknown, unknown>();
    const { __closure: closure } = worklet;
    const variables = Array.isArray(closure)
      ? closure.map((item) => toUI(item, api, seen))
      : Object.fromEntries(
          Object.entries((closure ?? {}) as object).map(([key, item]) => [
            key,
            toUI(item, api, seen),
          ]),
        );
    return fromUI(body.apply({ __closure: variables, _recur: run }, args));
  };
  wrapped.set(worklet, run);
  return run;
}

/** A function a hook or an animation takes to run on the UI thread, as that thread would have it. */
function uiThread<F extends AnyFunction>(fn: F): F {
  if (!uiRuntime.enabled) return fn;
  // A callback that is not a worklet cannot be called from the UI runtime at all.
  return (isWorklet(fn) ? onUI(fn) : remoteFunction(fn)) as unknown as F;
}

/**
 * A worklet that something other than a hook runs on the UI thread: a gesture's callbacks, which a
 * test calls itself. It runs as the UI runtime would run it, and refuses what a function that is not
 * a worklet refuses.
 */
export const onUiThread = uiThread;

/** What `runOnJS` is given may be a function as the UI runtime saw it: the one it stands for runs. */
const forJS = <F extends AnyFunction>(fn: F): F => ((fn as { [REMOTE]?: F })[REMOTE] ?? fn) as F;

/** runOnJS: the call goes back to JS, after `animationClock.jsLag` ms, in the order it was made. */
function runOnJS<A extends unknown[]>(fn: (...args: A) => unknown) {
  const real = forJS(fn as AnyFunction) as unknown as (...args: A) => unknown;
  return (...args: A) => {
    if (!animationClock.jsLag) return void real(...args);
    later(() => real(...args), animationClock.jsLag);
  };
}

// ---- Animated views ------------------------------------------------------------------------------

const HANDLE = Symbol('animated style');

/** The animated styles in a style, by the hook that made each. */
function handlesIn(style: unknown, into = new Set<symbol>()): Set<symbol> {
  if (Array.isArray(style)) style.forEach((entry) => handlesIn(entry, into));
  else if (style && typeof style === 'object') {
    const handle = (style as { [HANDLE]?: symbol })[HANDLE];
    if (handle) into.add(handle);
  }
  return into;
}

function animated(Base: ComponentType<never>, name: string) {
  const Component = ({ style, ...rest }: { style?: unknown; ref?: Ref<unknown> }) => {
    const now = handlesIn(style);
    // What it had when it was first drawn.
    const [before] = useState(now);
    if (uiRuntime.guardStyles) {
      if (before.size !== now.size || [...now].some((handle) => !before.has(handle))) {
        const names = (set: Set<symbol>) => [...set].map((handle) => handle.description).join(', ');
        throw new Error(
          `Animated.${name}: its animated styles changed after it was first drawn, from [${names(before)}] to [${names(now)}]. ` +
            `A view takes the first values of the styles it has at mount; one that arrives later gives it none, ` +
            `so it is drawn plain for a frame (full opacity) before the UI thread's first word. Keep one animated ` +
            `style on the view for its whole life, and let what the style does depend on a number it captures.`,
        );
      }
    }
    return createElement(Base as ComponentType<{ style?: unknown }>, { ...rest, style });
  };
  Component.displayName = `Animated.${name}`;
  return Component;
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
    if (!animationClock.silent || duration <= 1) callback?.(true);
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
    const run = elapsed - wait;
    const progress = duration === 0 ? (run >= 0 ? 1 : 0) : Math.min(1, Math.max(0, run / duration));
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
  uiOwned.add(mock);
  return mock as Mock & { value: T; get(): T; set(next: T): void };
}

const useSharedValue = <T>(initial: T) => useState(() => makeSharedValue(initial))[0];

/** The keyboard's height, for the one hook that reads it: tests move it with `keyboard.set(…)`. */
export const keyboard = makeSharedValue(0);

const AnimatedView = animated(View as ComponentType<never>, 'View');
const AnimatedText = animated(Text as ComponentType<never>, 'Text');
const AnimatedImage = animated(Image as ComponentType<never>, 'Image');
const AnimatedScrollView = animated(ScrollView as ComponentType<never>, 'ScrollView');

/** A style, as a hook gives it: the values now, and which hook they came from (see `animated`). */
function useStyleHandle<T extends object>(values: T, worklet: unknown): T {
  // The worklet is named for its file and place in it: the name says where to look.
  const name = isWorklet(worklet) ? /function (\w+)/.exec(worklet.__initData.code)?.[1] : undefined;
  const [handle] = useState(() => Symbol(name ?? 'animated style'));
  return Object.defineProperty({ ...values }, HANDLE, { value: handle });
}

const timed = (to: number, config?: { duration?: number }, callback?: Callback) =>
  callback || animationClock.stepped
    ? ({
        __animation: true,
        to,
        duration: config?.duration ?? 300,
        delay: 0,
        callback: callback && uiThread(callback),
      } satisfies Animation)
    : to;

const delayed = (ms: number, value: unknown) =>
  isAnimation(value) ? { ...value, delay: value.delay + ms } : value;

export const reanimatedMock = {
  __esModule: true,
  default: {
    View: AnimatedView,
    Text: AnimatedText,
    Image: AnimatedImage,
    ScrollView: AnimatedScrollView,
    createAnimatedComponent: identity,
  },
  createAnimatedComponent: identity,
  useSharedValue,
  makeMutable: <T>(initial: T) => makeSharedValue(initial),
  useDerivedValue: (compute: () => unknown) => {
    const run = uiThread(compute);
    const derived = { value: run(), get: run };
    uiOwned.add(derived);
    return derived;
  },
  useAnimatedStyle: (compute: () => object) =>
    useStyleHandle(uiThread(compute)() as object, compute),
  useAnimatedProps: (compute: () => object) => uiThread(compute)(),
  useReducedMotion: () => false,
  useAnimatedKeyboard: () => {
    const state = { value: 0, get: () => 0 };
    uiOwned.add(state);
    return { height: keyboard, state };
  },
  useAnimatedReaction: (prepare: () => unknown, react: (now: unknown, before: unknown) => void) => {
    const latest = useRef({ prepare, react });
    useEffect(() => {
      latest.current = { prepare, react };
    });
    useEffect(() => {
      const reaction: Reaction = {
        prepare: () => uiThread(latest.current.prepare)(),
        react: (now, before) => uiThread(latest.current.react)(now, before),
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
  runOnJS,
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
