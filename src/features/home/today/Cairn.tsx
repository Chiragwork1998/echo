import { useId } from 'react';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, G, RadialGradient, Stop } from 'react-native-svg';

import {
  OUTLINE_OUT_MS,
  REDUCED_MS,
  SHADE_LAG_MS,
  SHADE_MS,
  STONE_DROP,
  STONE_DROP_MS,
  STONE_STAGGER_MS,
} from './stoneMotion';
import { useBeat } from './useBeat';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedG = Animated.createAnimatedComponent(G);

/** Stones from the base up, in a 40 x 40 box. Slightly off-axis, as a hand-built stack would be. */
const STONES = [
  { cx: 20, cy: 31.4, rx: 16.6, ry: 7.2 },
  { cx: 19.6, cy: 21.2, rx: 11.6, ry: 5.2 },
  { cx: 20.4, cy: 13.4, rx: 7.7, ry: 3.6 },
  { cx: 20, cy: 7.4, rx: 4.5, ry: 2.9 },
] as const;

const SAND = [
  { offset: 0, color: '#F3E4CF' },
  { offset: 0.38, color: '#DEC4A5' },
  { offset: 0.76, color: '#B99676' },
  { offset: 1, color: '#7E5F47' },
] as const;

const OUTLINE = 'rgba(226,231,239,0.72)';
const DASH = '5.2 2.6';

type Shape = { cx: number; cy: number; rx: number; ry: number; fill: string };

/**
 * Every ellipse of the built stack, once. The plain drawing and the arrival both draw from it, so
 * that what the arrival comes to rest on is the plain drawing itself and not a copy of it.
 */
function shapes(id: string): { ground: Shape; stones: { body: Shape; shade: Shape | null }[] } {
  return {
    ground: { cx: 20.8, cy: 36.6, rx: 18.4, ry: 3.2, fill: `url(#${id}g)` },
    stones: STONES.map((stone, index) => {
      const above = STONES[index + 1];
      return {
        body: { ...stone, fill: `url(#${id}s)` },
        // Each stone darkens where the next one rests on it, which is what gives the stack weight.
        shade: above
          ? {
              cx: above.cx,
              cy: stone.cy - stone.ry + 1.1,
              rx: above.rx * 1.08,
              ry: 1.9,
              fill: `url(#${id}c)`,
            }
          : null,
      };
    }),
  };
}

function StackDefs({ id }: { id: string }) {
  return (
    <Defs>
      {/* The light falls from upper left and is shared by every stone in the stack. */}
      <RadialGradient id={`${id}s`} cx="36%" cy="24%" r="82%">
        {SAND.map(({ offset, color }) => (
          <Stop key={offset} offset={offset} stopColor={color} />
        ))}
      </RadialGradient>
      <RadialGradient id={`${id}g`} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#02060D" stopOpacity={0.62} />
        <Stop offset="1" stopColor="#02060D" stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={`${id}c`} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#3D2A1A" stopOpacity={0.55} />
        <Stop offset="1" stopColor="#3D2A1A" stopOpacity={0} />
      </RadialGradient>
    </Defs>
  );
}

function BuiltStack({ id }: { id: string }) {
  const { ground, stones } = shapes(id);
  return (
    <>
      <StackDefs id={id} />
      <Ellipse {...ground} />
      {stones.map(({ body, shade }) => (
        <G key={body.cy}>
          <Ellipse {...body} />
          {shade && <Ellipse {...shade} />}
        </G>
      ))}
    </>
  );
}

function OpenStack() {
  return STONES.map((stone) => (
    <Ellipse
      key={stone.cy}
      {...stone}
      fill="none"
      stroke={OUTLINE}
      strokeWidth={1.25}
      strokeDasharray={DASH}
      strokeLinecap="round"
    />
  ));
}

/** A day of the week as a small stack of stones: built when completed, a dashed outline otherwise. */
export function Cairn({ built, size }: { built: boolean; size: number }) {
  // Ids must be unique per instance, and url(#...) cannot hold the colons React puts in useId.
  const id = `cairn${useId().replaceAll(':', '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      {built ? <BuiltStack id={id} /> : <OpenStack />}
    </Svg>
  );
}

/** One ellipse of the arrival: it waits, then fades in, and may settle down from above. */
function Arriving({
  shape,
  at,
  ms,
  drop,
  initial,
}: {
  shape: Shape;
  at: number;
  ms: number;
  drop: number;
  initial: 0 | 1;
}) {
  const beat = useBeat(at, ms, initial);
  // Only the ellipse's own height and its opacity change: nothing is laid out again.
  const props = useAnimatedProps(() => ({
    cy: shape.cy - drop * (1 - beat.get()),
    opacity: beat.get(),
  }));
  return <AnimatedEllipse {...shape} animatedProps={props} />;
}

/** The dashed outline, which lets go as the stones come. */
function LettingGo({ ms, initial }: { ms: number; initial: 0 | 1 }) {
  const beat = useBeat(0, ms, initial);
  const props = useAnimatedProps(() => ({ opacity: 1 - beat.get() }));
  return (
    <AnimatedG animatedProps={props}>
      <OpenStack />
    </AnimatedG>
  );
}

/**
 * Today's cairn being built, in the same drawing as the plain one: the open outline lets go, and the
 * stones come down one on another from the base, each a little above its place and fading in, each
 * darkening the stone beneath it as it rests there. When it is done it is exactly the built cairn,
 * which is what the day then goes back to drawing.
 *
 * Reduce Motion: no drop and no stagger. The built stack fades in over the outline.
 * `initial` 1 draws the finished stack at once, with nothing to wait for.
 */
export function BuildingCairn({
  size,
  reduced = false,
  initial = 0,
}: {
  size: number;
  reduced?: boolean;
  initial?: 0 | 1;
}) {
  const id = `cairn${useId().replaceAll(':', '')}`;
  const { ground, stones } = shapes(id);
  const move = reduced ? 0 : STONE_DROP;
  // Each stone starts above the last; reduced, they all fade together.
  const startOf = (k: number) => (reduced ? 0 : k * STONE_STAGGER_MS);
  const length = reduced ? REDUCED_MS : STONE_DROP_MS;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false} testID="cairn-building">
      <StackDefs id={id} />
      <LettingGo ms={reduced ? REDUCED_MS : OUTLINE_OUT_MS} initial={initial} />
      <Arriving shape={ground} at={0} ms={length} drop={0} initial={initial} />
      {stones.map(({ body, shade }, k) => (
        <G key={body.cy}>
          <Arriving shape={body} at={startOf(k)} ms={length} drop={move} initial={initial} />
          {shade && (
            <Arriving
              shape={shade}
              at={reduced ? 0 : startOf(k + 1) + SHADE_LAG_MS}
              ms={reduced ? REDUCED_MS : SHADE_MS}
              drop={0}
              initial={initial}
            />
          )}
        </G>
      ))}
    </Svg>
  );
}
