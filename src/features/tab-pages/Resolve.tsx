import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ArrivalContext, useGlassAware } from '@/components/arrival';
import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { useDelayedTrue } from './useDelayedTrue';

/** A local read usually answers inside this, so a skeleton is not drawn for it at all. */
export const BARS_DELAY_MS = 240;
const BARS_FADE_MS = 200;
/** What arrives: each item rises 6 pt and fades in over this, a step after the one before. */
const ARRIVE_MS = 320;
const STEP_MS = 50;
const CAP = 6;
const RISE = 6;
/** When there was no skeleton to hand over from, the whole of it arrives as one. */
const BLOCK_MS = 240;
const SKELETON_OUT_MS = 180;
/** Long enough for the last item of the longest staggered arrival, and a little over. */
const SETTLE_MS = 760;

/** Whether the bars of the skeleton below are showing, when a Resolve above is keeping the time. */
const BarsContext = createContext<boolean | null>(null);
/** True while an enclosing Rise is still arriving. */
const ArrivingContext = createContext(false);
/** Whether something that arrives by itself would be doubling an arrival that is already under way. */
export const useIsArriving = () => useContext(ArrivingContext);

/** True while content is arriving from a skeleton that was seen, so rows may arrive one by one. */
const ArrivalOrderContext = createContext(false);

/**
 * A skeleton's body. The skeleton stays mounted, and in the accessibility tree, from the first
 * moment: only what is drawn waits (a local read is usually done before it would be seen), and then
 * fades in. Nothing in it moves. Under Reduce Motion it appears by opacity alone in 180 ms.
 * `immediate` for a wait that is known to be long (a reading that goes to a server), which arrives
 * with its own fade and gains nothing from a pause.
 */
export function Bars({ children, immediate = false }: PropsWithChildren<{ immediate?: boolean }>) {
  const reduced = useReduceMotion();
  const own = useDelayedTrue(true, BARS_DELAY_MS);
  const given = useContext(BarsContext);
  const visible = immediate || (given ?? own);
  const shown = useSharedValue(visible ? 1 : 0);
  const was = useRef(visible);
  useEffect(() => {
    // Nothing to do for a state it is already in: a skeleton that has yet to show asks for nothing.
    if (was.current === visible) return;
    was.current = visible;
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: reduced ? tokens.motion.fast : BARS_FADE_MS,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [reduced, shown, visible]);
  const { glass, arrival } = useGlassAware(shown);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  // Glass is drawn whole while the bars are on their way, and not at all before they are.
  const whole = useAnimatedStyle(() => ({ opacity: shown.get() > 0 ? 1 : 0 }));
  return (
    <ArrivalContext.Provider value={arrival}>
      <Animated.View style={glass ? whole : fade}>{children}</Animated.View>
    </ArrivalContext.Provider>
  );
}

type RiseProps = PropsWithChildren<{
  /** How long after mounting it waits. */
  delay?: number;
  duration?: number;
  /** How far below its place it begins, in points. */
  distance?: number;
  /** False draws it at rest at once. Read once, at mount: a thing arrives when it appears. */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * One thing arriving: opacity 0 to 1 and a rise (6 pt unless told), decelerating. Under Reduce Motion, 180 ms of
 * opacity, no rise and no wait.
 */
export function Rise({
  delay = 0,
  duration = ARRIVE_MS,
  distance = RISE,
  animate = true,
  style,
  children,
}: RiseProps) {
  const reduced = useReduceMotion();
  const [moving] = useState(animate);
  const shown = useSharedValue(moving ? 0 : 1);
  // True while this is arriving, so something inside that arrives by itself (a Notice) does not
  // arrive a second time on top of it. Over once the arrival has had its time.
  const [busy, setBusy] = useState(moving);
  useEffect(() => {
    if (!moving) return;
    shown.set(
      withDelay(
        reduced ? 0 : delay,
        withTiming(1, {
          duration: reduced ? tokens.motion.fast : duration,
          easing: EASE,
          reduceMotion: ReduceMotion.Never,
        }),
      ),
    );
    const over = setTimeout(
      () => setBusy(false),
      (reduced ? 0 : delay) + (reduced ? tokens.motion.fast : duration) + 40,
    );
    return () => clearTimeout(over);
  }, [delay, duration, moving, reduced, shown]);
  const { glass, arrival } = useGlassAware(shown);
  const motion = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: reduced ? 0 : (1 - shown.get()) * distance }],
  }));
  // A block with glass in it is whole from the moment it moves, and rises with no fade: the words on
  // the glass are what fade in.
  const block = useAnimatedStyle(() => ({
    opacity: shown.get() > 0 ? 1 : 0,
    transform: [{ translateY: reduced ? 0 : (1 - shown.get()) * distance }],
  }));
  return (
    <ArrivingContext.Provider value={busy}>
      <ArrivalContext.Provider value={arrival}>
        <Animated.View style={[style, glass ? block : motion]}>{children}</Animated.View>
      </ArrivalContext.Provider>
    </ArrivingContext.Provider>
  );
}

/** True while content arrives from a skeleton the person saw: a row may then wait its turn. */
export const useArriving = () => useContext(ArrivalOrderContext);

/** A row of a list that arrives with the others, one step after the one before, and only then. */
export function ArriveInOrder({
  index,
  step,
  cap,
  children,
}: PropsWithChildren<{ index: number; step: number; cap: number }>) {
  const arriving = useArriving();
  // Read once, at mount: a row that scrolls into being later, or comes with a refresh, is just there.
  const [moving] = useState(arriving);
  return moving ? <Rise delay={Math.min(index, cap - 1) * step}>{children}</Rise> : <>{children}</>;
}

function Leaving({ children }: PropsWithChildren) {
  const gone = useSharedValue(1);
  useEffect(() => {
    gone.set(
      withTiming(0, { duration: SKELETON_OUT_MS, easing: EASE, reduceMotion: ReduceMotion.Never }),
    );
  }, [gone]);
  const { glass, arrival } = useGlassAware(gone);
  const fade = useAnimatedStyle(() => ({ opacity: gone.get() }));
  // Glass is held whole under the arrival while its bars fade, and cut once they are gone.
  const whole = useAnimatedStyle(() => ({ opacity: gone.get() > 0 ? 1 : 0 }));
  return (
    <ArrivalContext.Provider value={arrival}>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.leaving, glass ? whole : fade]}
      >
        <BarsContext.Provider value>{children}</BarsContext.Provider>
      </Animated.View>
    </ArrivalContext.Provider>
  );
}

type Phase = 'waiting' | 'arriving' | 'settled';

type ResolveProps = PropsWithChildren<{
  ready: boolean;
  /** Drawn in `children`' place until `ready`. It owns its Loading label. */
  skeleton: ReactNode;
  /** Each child arrives in turn, 50 ms apart and at most six deep, instead of all as one. */
  each?: boolean;
  /**
   * The children bring their own order (see ArriveInOrder) when the skeleton was seen. If it never
   * showed they still arrive as one, so nothing flashes in.
   */
  rows?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * A wait, and what ends it. While not `ready` the skeleton stands where the content will be, its
 * bars arriving only if the wait outlasts 240 ms. When `ready` the content arrives where the bars
 * were, and the skeleton fades out under it over 180 ms. If the bars never showed the content
 * simply fades in, 240 ms and a 6 pt rise. Content that is ready from the first moment is drawn
 * at rest: it did not arrive, it was there.
 */
export function Resolve({
  ready,
  skeleton,
  each = false,
  rows = false,
  style,
  children,
}: ResolveProps) {
  const reduced = useReduceMotion();
  const barsShown = useDelayedTrue(!ready, BARS_DELAY_MS);
  const [phase, setPhase] = useState<Phase>(ready ? 'settled' : 'waiting');
  // What the wait looked like, remembered for the arrival: were the bars ever drawn?
  const [seen, setSeen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Fixed when the content arrives, so its tree never changes shape while it settles.
  const [ordered, setOrdered] = useState(false);

  if (barsShown && !seen) setSeen(true);
  if (!ready && phase !== 'waiting') {
    setPhase('waiting');
    setSeen(false);
    setLeaving(false);
    setOrdered(false);
  } else if (ready && phase === 'waiting') {
    setPhase('arriving');
    setLeaving(seen);
    setOrdered(rows && seen && !reduced);
  }

  useEffect(() => {
    if (phase !== 'arriving') return;
    const out = setTimeout(() => setLeaving(false), SKELETON_OUT_MS + 40);
    const settle = setTimeout(() => setPhase('settled'), SETTLE_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(settle);
    };
  }, [phase]);

  if (phase === 'waiting') {
    return (
      <View style={style}>
        <BarsContext.Provider value={barsShown}>{skeleton}</BarsContext.Provider>
      </View>
    );
  }

  const arriving = phase === 'arriving';
  const items = each ? Children.toArray(children) : [children];
  // A wrapper holds what an item returns, which may be several siblings (a fragment). They keep the
  // container's rhythm, or they would touch.
  const gap = StyleSheet.flatten(style)?.gap;
  const keep = gap === undefined ? undefined : { gap };
  // By the item's own key where it has one, so an optional item coming and going does not rebuild
  // the ones after it.
  const keyOf = (item: ReactNode, index: number) =>
    isValidElement(item) && item.key != null ? item.key : index;
  return (
    <View style={style}>
      {leaving ? <Leaving>{skeleton}</Leaving> : null}
      <ArrivalOrderContext.Provider value={ordered && arriving}>
        {items.map((item, index) =>
          ordered ? (
            <Fragment key={keyOf(item, index)}>{item}</Fragment>
          ) : (
            <Rise
              key={keyOf(item, index)}
              style={keep}
              animate={arriving}
              delay={seen ? Math.min(index, CAP - 1) * STEP_MS : 0}
              duration={seen ? ARRIVE_MS : BLOCK_MS}
            >
              {item}
            </Rise>
          ),
        )}
      </ArrivalOrderContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
});
