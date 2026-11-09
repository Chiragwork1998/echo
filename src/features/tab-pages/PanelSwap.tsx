import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { Surface } from './parts';

/** What a panel shows: one face of it. */
export type Face = {
  /** What the face is. A face with another key is another face, and this one gives way to it. */
  key: string;
  /** Strong glass, as a panel that asks something or waits on something has. */
  strong?: boolean;
  /** What is written on the glass. */
  glass: ReactNode;
  /** What stands under the glass, on the plate: its actions. */
  below?: ReactNode;
};

/** Far more than any panel is tall: the height of a region that is not being held. */
const FREE = 100000;

const swapMs = (reduced: boolean) => (reduced ? tokens.motion.fast : tokens.motion.standard);

/**
 * One face in a region, fading in when it arrives in place of another and out when it is replaced.
 * The same instance throughout, so what it holds is never built again as it goes from the one to
 * the other. One that is going lies over the top of the region, and cannot be touched or heard.
 */
function Layer({
  arriving,
  leaving,
  onLayout,
  testID,
  children,
}: {
  arriving: boolean;
  leaving: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  testID?: string;
  children: ReactNode;
}) {
  const reduced = useReduceMotion();
  const [startsAt] = useState(arriving ? 0 : 1);
  const shown = useSharedValue(startsAt);
  const target = leaving ? 0 : 1;
  useEffect(() => {
    if (shown.get() === target) return;
    shown.set(
      withTiming(target, {
        duration: swapMs(reduced),
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [reduced, shown, target]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View
      testID={testID}
      onLayout={onLayout}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      style={[leaving && styles.leaving, fade]}
    >
      {children}
    </Animated.View>
  );
}

type Held = { key: string; node: ReactNode };

/**
 * A part of the panel whose faces cross-fade in place while its height eases from the one face's to
 * the other's, so nothing around it jumps. The face that is there lies in the flow and says how tall
 * it is; one going lies over it. The height is fixed by React in the commit that begins the change
 * (the UI thread has not been told anything yet, and the face coming in would otherwise be drawn at
 * its own height for a frame), then held and eased on the UI thread, then let go once the change is
 * over and the height is the face's own again. Under Reduce Motion the height does not travel: it is
 * what the larger face needs while they cross, and then the face's own.
 */
function Region({
  faces,
  clip,
  testID,
}: {
  faces: readonly Held[];
  clip: boolean;
  testID?: string;
}) {
  const reduced = useReduceMotion();
  const current = faces[faces.length - 1]!;
  const changing = faces.length > 1;

  // How tall each face was when last laid out here.
  const [sizes, setSizes] = useState<ReadonlyMap<string, number>>(() => new Map());
  const measure = (key: string) => (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setSizes((known) => (known.get(key) === height ? known : new Map(known).set(key, height)));
  };

  // The height this region keeps through a change, from the commit that begins it.
  const [kept, setKept] = useState<number | null>(null);
  // The face whose height the UI thread has brought the region to.
  const [reached, setReached] = useState<string | null>(null);
  const [face, setFace] = useState(current.key);
  if (face !== current.key) {
    setFace(current.key);
    setReached(null);
    // The first change keeps the height the region had; one that follows it before it is over keeps
    // whatever it is holding already.
    if (kept === null) setKept(sizes.get(face) ?? null);
  }

  // The UI thread's hold on the height: below nothing, there is none.
  const held = useSharedValue(-1);
  const size = useAnimatedStyle(() => {
    const height = held.get();
    return height < 0
      ? { minHeight: 0, maxHeight: FREE }
      : { minHeight: height, maxHeight: height };
  });

  const target = sizes.get(current.key);
  const shown = current.key;
  useEffect(() => {
    // Nothing kept, nothing to go to yet: the region is the height of what is in it.
    if (kept === null || target === undefined) return;
    if (held.get() < 0) held.set(kept);
    if (reduced) {
      held.set(Math.max(kept, target));
      return;
    }
    held.set(
      withTiming(
        target,
        { duration: tokens.motion.standard, easing: EASE, reduceMotion: ReduceMotion.Never },
        (finished) => {
          'worklet';
          if (finished) runOnJS(setReached)(shown);
        },
      ),
    );
  }, [held, kept, reduced, shown, target]);

  // Over once the faces have finished crossing and the height has arrived. React lets go of its
  // height first, while the UI thread holds the same one, and then the UI thread lets go.
  const over = !changing && (kept === null || reduced || reached === shown);
  if (over && kept !== null) setKept(null);
  useEffect(() => {
    if (over && kept === null) held.set(-1);
  }, [held, kept, over]);

  // While the height is held, what is in the region may be taller than it, and is cut at its edge.
  const holding = changing || kept !== null;
  return (
    <Animated.View
      testID={testID}
      style={[kept === null ? null : { height: kept }, clip && holding && styles.clip, size]}
    >
      {faces.map(({ key, node }) => {
        const leaving = key !== current.key;
        return (
          <Layer
            key={key}
            testID={testID && `${testID}-${key}`}
            arriving={!leaving && changing}
            leaving={leaving}
            onLayout={leaving ? undefined : measure(key)}
          >
            {node}
          </Layer>
        );
      })}
    </Animated.View>
  );
}

/**
 * A panel of glass whose face changes: a page's own words give way to a question, and the question
 * to a reading. The glass stays (it is never faded: Android loses its blur under a fading view, and
 * a panel cut and drawn again leaves the sky bare for a frame or its glass empty), its height and its
 * tint ease from the one face's to the other's, and the words on it cross-fade in place, as do the
 * actions under it. 320 ms on the shared ease; under Reduce Motion, 180 ms of opacity alone. The
 * blur, which cannot be faded, takes the new face's strength as the change begins. Changed again
 * before the last change is over, every face that is going goes together.
 */
export function PanelSwap({
  face,
  radius = tokens.radius.card,
  testID,
}: {
  face: Face;
  radius?: number;
  /** Names the glass's part `${testID}-glass` and the part under it `${testID}-below`. */
  testID?: string;
}) {
  const reduced = useReduceMotion();
  const [now, setNow] = useState(face);
  const [before, setBefore] = useState<readonly Face[]>([]);
  if (now.key !== face.key) {
    setBefore((held) => [...held.filter(({ key }) => key !== face.key), now]);
    setNow(face);
  } else if (now !== face) {
    setNow(face);
  }
  const changing = before.length > 0;
  useEffect(() => {
    if (!changing) return;
    const done = setTimeout(() => setBefore([]), swapMs(reduced) + 40);
    return () => clearTimeout(done);
  }, [before, changing, reduced]);

  const strong = Boolean(face.strong);
  const share = useSharedValue(strong ? 1 : 0);
  useEffect(() => {
    share.set(
      withTiming(strong ? 1 : 0, {
        duration: swapMs(reduced),
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [reduced, share, strong]);

  const going = before.filter(({ key }) => key !== face.key);
  const faces = [...going, face];
  return (
    <View>
      <Surface strength={strong ? 'strong' : 'regular'} strongShare={share} radius={radius}>
        <Region
          faces={faces.map(({ key, glass }) => ({ key, node: glass }))}
          clip={false}
          testID={testID && `${testID}-glass`}
        />
      </Surface>
      <Region
        faces={faces.map(({ key, below }) => ({
          key,
          node: below ? <View style={styles.below}>{below}</View> : null,
        }))}
        clip
        testID={testID && `${testID}-below`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
  clip: { overflow: 'hidden' },
  // The page's own rhythm between a panel and what stands under it.
  below: { paddingTop: tokens.space[16] },
});
