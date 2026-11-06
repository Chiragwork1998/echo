import * as Haptics from 'expo-haptics';
import { useEffect, useId, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
  Text as SvgText,
  TextPath,
} from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

// Measured from the Night golden (868 x 1812, normalised to 393 x 852): the stone is 150 pt across.
export const STONE_SIZE = 150;
const RADIUS = STONE_SIZE / 2;
const MARGIN = 36; // canvas room for the shadow and the halo
const CANVAS = STONE_SIZE + MARGIN * 2;
const CENTRE = CANVAS / 2;
const ARC_RADIUS = 52;
const ARC_FONT = 8.4;
const ARC_TRACKING = 3.1;
const BEGIN_SIZE = 25;
const BEGIN_LIFT = 5; // the word sits a little above centre, as in the golden
const PRESS_SCALE = 0.968;
const PRESS_SINK = 2.5;
const HALO_REST = 0.5;
const HALO_PEAK = 0.9;
const BREATH_MS = 5200;

// Limestone, from the golden: warm cream with ochre mottling, never white, never grey.
const SPECKLES = ['#C0834E', '#9A6B42', '#B97F4C', '#7A5A3C'] as const;
const PIT_DARK = '#5A4129';

/** Deterministic, so the stone is the same stone on every launch and in every test. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Grain = { x: number; y: number; r: number; o: number; c: number };

function scatter(random: () => number, count: number, reach: number, rMin: number, rMax: number) {
  const grains: Grain[] = [];
  for (let i = 0; i < count; i += 1) {
    const distance = Math.sqrt(random()) * reach;
    const angle = random() * Math.PI * 2;
    grains.push({
      x: CENTRE + Math.cos(angle) * distance,
      y: CENTRE + Math.sin(angle) * distance,
      r: rMin + random() * (rMax - rMin),
      o: 0.1 + random() * 0.22,
      c: Math.floor(random() * SPECKLES.length),
    });
  }
  return grains;
}

/** Fine mottling at three scales, plus faint veins, built once. */
function buildTexture() {
  const random = seeded(2417);
  const reach = RADIUS - 1;
  const veins = Array.from({ length: 9 }, () => {
    const x = CENTRE + (random() - 0.5) * RADIUS * 1.5;
    const y = CENTRE + (random() - 0.5) * RADIUS * 1.5;
    const dx = (random() - 0.5) * 38;
    const dy = (random() - 0.5) * 22;
    return `M${x.toFixed(1)} ${y.toFixed(1)} q${(dx / 2 + random() * 8).toFixed(1)} ${(dy / 2 - random() * 8).toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)}`;
  });
  return {
    darkBlots: scatter(random, 30, reach, 4, 10),
    paleBlots: scatter(random, 30, reach, 4, 11),
    speckles: scatter(random, 520, reach, 0.3, 0.95),
    pits: scatter(random, 34, reach, 0.6, 1.15),
    paleDust: scatter(random, 220, reach, 0.3, 0.8),
    veins,
  };
}

const texture = buildTexture();
const ARC = arcPath(ARC_RADIUS);

/** The limestone itself. Pure drawing: no text, no state. */
function StoneArt({ arc, caption }: { arc: string; caption: string }) {
  const id = useId().replaceAll(':', '');
  const ref = (name: string) => `url(#${name}${id})`;
  return (
    <Svg width={CANVAS} height={CANVAS} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
      <Defs>
        <RadialGradient id={`body${id}`} cx="0.4" cy="0.3" r="0.82" fx="0.36" fy="0.26">
          <Stop offset="0" stopColor="#FBF1E1" />
          <Stop offset="0.36" stopColor="#F2E3CD" />
          <Stop offset="0.7" stopColor="#E5D0B3" />
          <Stop offset="0.9" stopColor="#D2B995" />
          <Stop offset="1" stopColor="#BCA07C" />
        </RadialGradient>
        <RadialGradient id={`falloff${id}`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#6A4A2E" stopOpacity={0} />
          <Stop offset="0.78" stopColor="#6A4A2E" stopOpacity={0} />
          <Stop offset="0.95" stopColor="#6A4A2E" stopOpacity={0.1} />
          <Stop offset="1" stopColor="#4A3018" stopOpacity={0.26} />
        </RadialGradient>
        <LinearGradient id={`shade${id}`} x1="0.15" y1="0.1" x2="0.9" y2="0.95">
          <Stop offset="0" stopColor="#FFF6E2" stopOpacity={0.08} />
          <Stop offset="0.5" stopColor="#3A2614" stopOpacity={0} />
          <Stop offset="1" stopColor="#2B1B0C" stopOpacity={0.3} />
        </LinearGradient>
        <RadialGradient id={`shine${id}`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`blotDark${id}`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#B38A5E" stopOpacity={0.15} />
          <Stop offset="1" stopColor="#9C7550" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`blotPale${id}`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFFBF0" stopOpacity={0.3} />
          <Stop offset="1" stopColor="#FFFBF0" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`rim${id}`} x1="0.08" y1="0.12" x2="0.92" y2="0.9">
          <Stop offset="0" stopColor="#FFF3D6" stopOpacity={0.95} />
          <Stop offset="0.3" stopColor="#FFEFCB" stopOpacity={0.42} />
          <Stop offset="0.62" stopColor="#FFE9C2" stopOpacity={0.06} />
          <Stop offset="1" stopColor="#9FC4EA" stopOpacity={0.12} />
        </LinearGradient>
        <LinearGradient id={`moonlit${id}`} x1="0" y1="0.2" x2="0.38" y2="0.62">
          <Stop offset="0" stopColor="#FFDA96" stopOpacity={0.8} />
          <Stop offset="1" stopColor="#FFDA96" stopOpacity={0} />
        </LinearGradient>
        <ClipPath id={`clip${id}`}>
          <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} />
        </ClipPath>
        <Path id={`arc${id}`} d={arc} />
      </Defs>

      {/* Moonlit glow on the left edge, outside the stone. */}
      <Circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS + 2.2}
        stroke={ref('moonlit')}
        strokeWidth={4.5}
        fill="none"
        opacity={0.55}
      />
      <Circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS + 0.9}
        stroke={ref('moonlit')}
        strokeWidth={1.8}
        fill="none"
        opacity={0.8}
      />

      <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill={ref('body')} />

      <G clipPath={ref('clip')}>
        {texture.darkBlots.map((g, i) => (
          <Circle key={`d${i}`} cx={g.x} cy={g.y} r={g.r} fill={ref('blotDark')} />
        ))}
        {texture.paleBlots.map((g, i) => (
          <Circle key={`p${i}`} cx={g.x} cy={g.y} r={g.r} fill={ref('blotPale')} />
        ))}
        {texture.veins.map((d, i) => (
          <Path
            key={`v${i}`}
            d={d}
            stroke="#8A6742"
            strokeWidth={0.55}
            strokeOpacity={0.14}
            fill="none"
          />
        ))}
        {texture.paleDust.map((g, i) => (
          <Circle key={`u${i}`} cx={g.x} cy={g.y} r={g.r} fill="#FFFDF4" opacity={g.o + 0.15} />
        ))}
        {texture.speckles.map((g, i) => (
          <Circle key={`s${i}`} cx={g.x} cy={g.y} r={g.r} fill={SPECKLES[g.c]} opacity={g.o} />
        ))}
        {texture.pits.map((g, i) => (
          <G key={`t${i}`}>
            <Circle cx={g.x + 0.6} cy={g.y + 0.7} r={g.r} fill="#FFFBEE" opacity={0.4} />
            <Circle cx={g.x} cy={g.y} r={g.r} fill={PIT_DARK} opacity={g.o + 0.05} />
          </G>
        ))}
        <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill={ref('shade')} />
        <Circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill={ref('falloff')} />
        <Ellipse
          cx={CENTRE - 24}
          cy={CENTRE - 32}
          rx={46}
          ry={32}
          fill={ref('shine')}
          transform={`rotate(-28 ${CENTRE - 24} ${CENTRE - 32})`}
        />
      </G>

      {/* Soft rim light, brightest where the moon is. */}
      <Circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS - 0.8}
        stroke={ref('rim')}
        strokeWidth={1.6}
        fill="none"
      />

      <SvgText
        fill="#1A2230"
        fillOpacity={0.74}
        fontFamily="Inter_500Medium"
        fontSize={ARC_FONT}
        letterSpacing={ARC_TRACKING}
        textAnchor="middle"
      >
        <TextPath href={`#arc${id}`} startOffset="50%" textAnchor="middle">
          {caption}
        </TextPath>
      </SvgText>
    </Svg>
  );
}

/** The path the caption runs along: the lower half of a circle, left to right. */
function arcPath(radius: number) {
  const left = CENTRE - radius * Math.cos(0.12);
  const right = CENTRE + radius * Math.cos(0.12);
  const y = CENTRE + radius * Math.sin(0.12);
  return `M ${left.toFixed(2)} ${y.toFixed(2)} A ${radius} ${radius} 0 1 0 ${right.toFixed(2)} ${y.toFixed(2)}`;
}

type Props = {
  title: string;
  arcCaption: string;
  accessibilityLabel: string;
  onPress: () => void;
};

/**
 * Night's Begin stone, drawn in code: pale limestone with fine mottling, a rim light that catches the
 * moon, and a soft shadow. Heavy to press: it settles into its shadow and springs back.
 */
export function LimestoneStone({ title, arcCaption, accessibilityLabel, onPress }: Props) {
  const reduced = useReduceMotion();
  const press = useSharedValue(0);
  const breath = useSharedValue(HALO_REST);

  const caption = useMemo(() => arcCaption.toUpperCase(), [arcCaption]);

  useEffect(() => {
    if (reduced) return;
    breath.set(
      withRepeat(
        withTiming(HALO_PEAK, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [breath, reduced]);

  const body = useAnimatedStyle(() => ({
    transform: [
      { translateY: PRESS_SINK * press.get() },
      { scale: 1 - (1 - PRESS_SCALE) * press.get() },
    ],
  }));
  const halo = useAnimatedStyle(() => ({ opacity: breath.get() * (1 - 0.4 * press.get()) }));

  const pressTo = (to: number) =>
    press.set(
      to === 1
        ? withTiming(1, { duration: tokens.motion.instant, reduceMotion: ReduceMotion.System })
        : withSpring(0, { ...tokens.motion.spring, reduceMotion: ReduceMotion.System }),
    );

  return (
    <View style={styles.root}>
      <Animated.View pointerEvents="none" style={[styles.canvas, halo]}>
        <Svg width={CANVAS} height={CANVAS} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
          <Defs>
            <RadialGradient id="homeStoneHalo" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0.55" stopColor="#FFE8BE" stopOpacity={0.16} />
              <Stop offset="1" stopColor="#FFE8BE" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={CENTRE} cy={CENTRE} r={CANVAS / 2} fill="url(#homeStoneHalo)" />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.canvas, body]}>
        <Svg width={CANVAS} height={CANVAS} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
          <Defs>
            <RadialGradient id="homeStoneGround" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#01050C" stopOpacity={0.6} />
              <Stop offset="0.6" stopColor="#01050C" stopOpacity={0.22} />
              <Stop offset="1" stopColor="#01050C" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={CENTRE}
            cy={CENTRE + RADIUS * 0.86}
            rx={RADIUS * 1.0}
            ry={RADIUS * 0.24}
            fill="url(#homeStoneGround)"
          />
        </Svg>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.canvas, body]}>
        <StoneArt arc={ARC} caption={caption} />
        <View style={styles.title}>
          <EchoText
            variant="displayM"
            color="textInk"
            align="center"
            style={{ fontSize: BEGIN_SIZE, lineHeight: BEGIN_SIZE * 1.3 }}
            maxFontSizeMultiplier={1.3}
          >
            {title}
          </EchoText>
        </View>
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        onPressIn={() => pressTo(1)}
        onPressOut={() => pressTo(0)}
        style={styles.hit}
        testID="home-begin-stone"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: STONE_SIZE, height: STONE_SIZE, alignSelf: 'center' },
  canvas: { position: 'absolute', left: -MARGIN, top: -MARGIN, width: CANVAS, height: CANVAS },
  title: {
    position: 'absolute',
    left: MARGIN,
    right: MARGIN,
    top: CENTRE - BEGIN_SIZE * 0.65 - BEGIN_LIFT,
    alignItems: 'center',
  },
  hit: { ...StyleSheet.absoluteFill, borderRadius: RADIUS },
});
