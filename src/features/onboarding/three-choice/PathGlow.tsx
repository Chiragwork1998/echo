import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/design/theme';
import { tokens, type ThemeName } from '@/design/tokens';
import { pathLength, smoothPath } from '@/features/onboarding/intent/geometry';

import type { Point } from './scenes';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SPRING = { ...tokens.motion.spring, reduceMotion: ReduceMotion.System };

// Light laid over the chosen path: soft wide halos, a bright core and a hot centre line, the way the
// Night golden lights its path. Day's is a paler sheen, as in the Day golden. Widths in points.
const LAYERS: Record<ThemeName, readonly { width: number; opacity: number; colour: string }[]> = {
  night: [
    { width: 40, opacity: 0.1, colour: '#FFB955' },
    { width: 24, opacity: 0.2, colour: '#FFC066' },
    { width: 12, opacity: 0.34, colour: '#FFD07C' },
    { width: 4.2, opacity: 0.8, colour: '#FFE6AE' },
    { width: 1.6, opacity: 0.95, colour: '#FFF6E0' },
  ],
  day: [
    { width: 28, opacity: 0.16, colour: '#FFF0CC' },
    { width: 15, opacity: 0.28, colour: '#FFF3D6' },
    { width: 8, opacity: 0.42, colour: '#FFF6DE' },
    { width: 3.4, opacity: 0.5, colour: '#FFFDF4' },
  ],
};
// The light holds, then fades out where the path widens into open ground.
const FADE_FROM = 0.68;

type Props = { line: readonly Point[]; selected: boolean };

/**
 * Lights one path in the photograph. Decorative. On selection the light runs down the path from its
 * stem, and withdraws up it when another is chosen.
 */
export function PathGlow({ line, selected }: Props) {
  const { name } = useTheme();
  const { width, height } = useWindowDimensions();
  const id = `glow${useId().replaceAll(':', '')}`;
  const progress = useSharedValue(selected ? 1 : 0);
  const { d, length, top, bottom } = useMemo(
    () => ({
      d: smoothPath(line),
      length: pathLength(line) + 2,
      top: Math.min(...line.map((q) => q.y)),
      bottom: Math.max(...line.map((q) => q.y)),
    }),
    [line],
  );
  const layers = LAYERS[name];

  useEffect(() => {
    progress.set(withSpring(selected ? 1 : 0, SPRING));
  }, [selected, progress]);

  const animated = useAnimatedProps(() => {
    const along = Math.min(1, Math.max(0, progress.get()));
    return { strokeDashoffset: length * (1 - along), strokeOpacity: Math.min(1, along * 3) };
  });

  return (
    <Svg
      testID="path-glow"
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        {layers.map(({ colour }, i) => (
          <LinearGradient
            key={i}
            id={`${id}${i}`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={top}
            x2="0"
            y2={bottom}
          >
            <Stop offset="0" stopColor={colour} />
            <Stop offset={FADE_FROM} stopColor={colour} />
            <Stop offset="1" stopColor={colour} stopOpacity={0} />
          </LinearGradient>
        ))}
      </Defs>
      {layers.map(({ width: stroke, opacity }, i) => (
        <AnimatedPath
          key={i}
          d={d}
          fill="none"
          stroke={`url(#${id}${i})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[length, length]}
          fillOpacity={0}
          opacity={opacity}
          animatedProps={animated}
        />
      ))}
    </Svg>
  );
}
