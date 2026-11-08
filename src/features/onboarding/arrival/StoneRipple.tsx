import { useEffect, useId, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { EASE } from '@/design/ease';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { FLATTEN, REACH, type Point, type Water } from './geometry';
import { IMPACT_DELAY, impactAt, standingDelay } from './impact';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedG = Animated.createAnimatedComponent(G);

// A ring leaves the stone's edge, spreads and thins, and is gone before it reaches REACH. Three
// rings share one slow cycle (the mood's own pace, in WATER), so one is always on its way out while
// the next is being born. The very first leaves when a stone is chosen: see ImpactRing.
const RING_COUNT = 3;
const RING_OPACITY = 0.95;
const RING_STROKE = { from: 1.7, to: 0.9 };
// Reduced Motion keeps the same three rings, still, as in the golden.
const STILL_RINGS = [
  { offset: 10, opacity: 0.9 },
  { offset: 23, opacity: 0.62 },
  { offset: 36, opacity: 0.38 },
];
// A warm halo that hugs the stone's rim, clear in the middle so the stone's own texture still reads.
const GLOW = { colour: '#FFE8BE', reach: 32, peak: 0.5 };
// Light catches the stone's lower rim, as in the golden: a thin warm line over a wider soft one.
const RIM = { colour: '#FFE2A8', core: 1.6, soft: 6, coreOpacity: 0.8, softOpacity: 0.2 };
const BREATH = 3800;
// Glints sit on the water around the stone: angle (degrees), distance from the rim, radius, group.
const GLINTS = [
  { angle: 196, offset: 10, size: 2.2, group: 0 },
  { angle: 232, offset: 23, size: 1.7, group: 1 },
  { angle: 268, offset: 36, size: 2.4, group: 0 },
  { angle: 312, offset: 23, size: 1.8, group: 1 },
  { angle: 349, offset: 10, size: 2.3, group: 0 },
  { angle: 20, offset: 36, size: 1.8, group: 1 },
  { angle: 58, offset: 23, size: 2.4, group: 0 },
  { angle: 101, offset: 10, size: 1.9, group: 1 },
  { angle: 143, offset: 36, size: 2.2, group: 0 },
] as const;
// The core is a pale warm white; the halo is the amber the golden's glints bloom into.
const GLINT = {
  core: '#FFF6E2',
  halo: '#FFC978',
  haloOpacity: 0.42,
  haloReach: 2.7,
  coreScale: 0.9,
};
const PAD = 8;
// A stone's glow comes up fast and decelerating; when another stone is chosen it goes slowly, so the
// old rings are seen spreading and fading, never cut. Under Reduce Motion it is a plain short fade.
const FADE_IN = tokens.motion.standard;
const FADE_OUT = tokens.motion.atmosphere;
const FADE_OUT_EASING = Easing.inOut(Easing.sin);
// The impact ring is finished (and unmounted) a moment after its animation ends.
const IMPACT_GRACE = 80;

type Props = {
  /** Centre of the stone on screen. */
  at: Point;
  /** Half-width and half-height of the stone's outline on screen. */
  rx: number;
  ry: number;
  active: boolean;
  /** How the water answers this stone: its pace, and the ring sent out when it is chosen. */
  water: Water;
};

type RingProps = { cx: number; cy: number; rx: number; ry: number; run: boolean };

/**
 * One expanding ring of the standing set. Its radius, opacity and weight all follow the same slow
 * progress value, which repeats every `cycle` ms after `delay`.
 */
function Ring({ cx, cy, rx, ry, run, cycle, delay }: RingProps & { cycle: number; delay: number }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!run) return;
    progress.set(0);
    progress.set(
      withDelay(
        delay,
        withRepeat(
          withTiming(1, {
            duration: cycle,
            easing: Easing.out(Easing.quad),
            reduceMotion: ReduceMotion.System,
          }),
          -1,
          false,
        ),
      ),
    );
    // Cancel only: rings left mid-spread fade out with their group rather than vanishing.
    return () => cancelAnimation(progress);
  }, [run, delay, cycle, progress]);

  const animatedProps = useAnimatedProps(() => {
    const p = progress.get();
    return {
      rx: rx + REACH * p,
      ry: ry + REACH * FLATTEN * p,
      strokeOpacity: interpolate(p, [0, 0.12, 0.6, 1], [0, RING_OPACITY, RING_OPACITY * 0.5, 0]),
      strokeWidth: interpolate(p, [0, 1], [RING_STROKE.from, RING_STROKE.to]),
    };
  });
  return (
    <AnimatedEllipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill="none"
      stroke={colors.textPrimary}
      strokeOpacity={0}
      animatedProps={animatedProps}
    />
  );
}

/**
 * The stone has been chosen, and the water answers once: a single ring leaves its rim, spreads as
 * far as the mood allows and is gone, then the standing rings take over. It is mounted afresh for
 * every choice, and takes itself away when it has faded.
 */
function ImpactRing({ cx, cy, rx, ry, water }: Omit<RingProps, 'run'> & { water: Water }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  const [gone, setGone] = useState(false);
  const { impact } = water;
  useEffect(() => {
    progress.set(
      withDelay(
        IMPACT_DELAY,
        withTiming(1, {
          duration: impact.ms,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        }),
      ),
    );
    const timer = setTimeout(() => setGone(true), IMPACT_DELAY + impact.ms + IMPACT_GRACE);
    return () => {
      cancelAnimation(progress);
      clearTimeout(timer);
    };
  }, [impact.ms, progress]);

  const animatedProps = useAnimatedProps(() => impactAt(progress.get(), impact, rx, ry));
  if (gone) return null;
  return (
    <AnimatedEllipse
      testID="stone-impact"
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill="none"
      stroke={colors.textPrimary}
      strokeOpacity={0}
      animatedProps={animatedProps}
    />
  );
}

/** Two glint groups that brighten in turn, so the water seems to catch the light, never flash. */
function Glints({
  cx,
  cy,
  rx,
  ry,
  run,
  twinkle: pace,
  glow,
}: Omit<RingProps, 'index'> & { twinkle: number; glow: string }) {
  const twinkle = useSharedValue(0);
  useEffect(() => {
    if (!run) return;
    twinkle.set(
      withRepeat(
        withTiming(1, {
          duration: pace,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(twinkle);
  }, [run, pace, twinkle]);
  const first = useAnimatedProps(() => ({ opacity: 0.55 + 0.45 * twinkle.get() }));
  const second = useAnimatedProps(() => ({ opacity: 1 - 0.45 * twinkle.get() }));
  return (
    <>
      {[first, second].map((animatedProps, group) => (
        <AnimatedG
          key={group}
          opacity={run ? undefined : 0.8}
          animatedProps={run ? animatedProps : undefined}
        >
          {GLINTS.filter((glint) => glint.group === group).map(({ angle, offset, size }) => {
            const radians = (angle * Math.PI) / 180;
            const x = cx + (rx + offset) * Math.cos(radians);
            const y = cy + (ry + offset * FLATTEN) * Math.sin(radians);
            return (
              <G key={angle}>
                <Circle cx={x} cy={y} r={size * 3.6} fill={`url(#${glow}glint)`} />
                <Circle cx={x} cy={y} r={size * GLINT.coreScale} fill={GLINT.core} />
              </G>
            );
          })}
        </AnimatedG>
      ))}
    </>
  );
}

/**
 * The heart of the screen: the chosen stone's glow, and rings of water spreading slowly from it.
 * When a stone is chosen the water answers once with a ring that leaves its rim, then the standing
 * rings follow at the mood's own pace. When another stone is chosen these fade slowly, so they are
 * seen spreading, not cut. Decorative, so it is hidden from screen readers and from touches. With
 * Reduce Motion on, the rings and glints stay still, as in the golden.
 */
export function StoneRipple({ at, rx, ry, active, water }: Props) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const id = `glow${useId().replaceAll(':', '')}`;
  const presence = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    presence.set(
      withTiming(active ? 1 : 0, {
        duration: reduced ? tokens.motion.fast : active ? FADE_IN : FADE_OUT,
        easing: active ? EASE : FADE_OUT_EASING,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [active, reduced, presence]);
  const breath = useSharedValue(1);
  useEffect(() => {
    if (!active || reduced) return;
    breath.set(
      withRepeat(
        withTiming(0.72, {
          duration: BREATH,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(breath);
  }, [active, reduced, breath]);

  // A stone newly chosen gets its own impact ring, keyed by how many it has had. One that is chosen
  // when the screen opens (a saved choice) has nothing to answer, so it has none.
  const [wasActive, setWasActive] = useState(active);
  const [impacts, setImpacts] = useState(0);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setImpacts(impacts + 1);
  }
  const answered = impacts > 0 && !reduced;

  const group = useAnimatedStyle(() => ({ opacity: presence.get() }));
  const halo = useAnimatedProps(() => ({ opacity: breath.get() }));

  // Room for the furthest any ring spreads (a heavy stone's impact goes past the standing reach).
  const reach = Math.max(REACH, water.impact.reach);
  const spreadX = reach + PAD;
  const spreadY = reach * FLATTEN + PAD;
  const width = (rx + spreadX) * 2;
  const height = (ry + spreadY) * 2;
  const cx = width / 2;
  const cy = height / 2;
  const run = active && !reduced;

  return (
    <Animated.View
      testID="stone-ripple"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.layer, { left: at.x - cx, top: at.y - cy, width, height }, group]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0.5" stopColor={GLOW.colour} stopOpacity={0} />
            <Stop offset="0.74" stopColor={GLOW.colour} stopOpacity={GLOW.peak} />
            <Stop offset="1" stopColor={GLOW.colour} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}glint`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={GLINT.halo} stopOpacity={GLINT.haloOpacity} />
            <Stop offset="0.35" stopColor={GLINT.halo} stopOpacity={GLINT.haloOpacity * 0.4} />
            <Stop offset="1" stopColor={GLINT.halo} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`${id}rim`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={RIM.colour} stopOpacity={0} />
            <Stop offset="0.3" stopColor={RIM.colour} stopOpacity={1} />
            <Stop offset="0.7" stopColor={RIM.colour} stopOpacity={1} />
            <Stop offset="1" stopColor={RIM.colour} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <AnimatedG animatedProps={halo}>
          <Ellipse
            cx={cx}
            cy={cy}
            rx={rx + GLOW.reach}
            ry={ry + GLOW.reach * FLATTEN}
            fill={`url(#${id})`}
          />
          {[RIM.soft, RIM.core].map((strokeWidth, layer) => (
            <Path
              key={strokeWidth}
              d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`}
              fill="none"
              stroke={`url(#${id}rim)`}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={layer === 0 ? RIM.softOpacity : RIM.coreOpacity}
            />
          ))}
        </AnimatedG>
        {reduced
          ? STILL_RINGS.map(({ offset, opacity }) => (
              <Ellipse
                key={offset}
                cx={cx}
                cy={cy}
                rx={rx + offset}
                ry={ry + offset * FLATTEN}
                fill="none"
                stroke={colors.textPrimary}
                strokeWidth={1}
                strokeOpacity={opacity}
              />
            ))
          : Array.from({ length: RING_COUNT }, (_, index) => (
              <Ring
                key={index}
                cx={cx}
                cy={cy}
                rx={rx}
                ry={ry}
                run={run}
                cycle={water.cycle}
                delay={standingDelay(index, water, answered)}
              />
            ))}
        {answered ? (
          <ImpactRing key={impacts} cx={cx} cy={cy} rx={rx} ry={ry} water={water} />
        ) : null}
        <Glints cx={cx} cy={cy} rx={rx} ry={ry} run={run} twinkle={water.twinkle} glow={id} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ layer: { position: 'absolute' } });
