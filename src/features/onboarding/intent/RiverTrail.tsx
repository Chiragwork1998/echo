import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/design/theme';
import { usePlatePoint } from '@/design/usePlatePoint';

import { DASH, TRAIL_LEGS, dashArrayFor, pathLength, smoothPath } from './geometry';

const SHADOW_COLOUR = 'rgba(3,11,22,0.38)';
const SHADOW_EXTRA = 1.6;

/**
 * The dotted line linking the four points. Decorative, so it is hidden from screen readers and
 * ignores touches. Legs are mapped onto the screen point by point, which keeps the dashes the same
 * size on every phone while the line follows the river.
 */
export function RiverTrail() {
  const { colors } = useTheme();
  const toScreen = usePlatePoint();
  const { width, height } = useWindowDimensions();

  const legs = useMemo(
    () =>
      TRAIL_LEGS.map((leg) => {
        const points = leg.map((point) => toScreen(point.x, point.y));
        return { d: smoothPath(points), dash: dashArrayFor(pathLength(points)) };
      }),
    [toScreen],
  );

  return (
    <Svg
      testID="river-trail"
      width={width}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {legs.map(({ d, dash }, index) => (
        <Path
          key={`shadow-${index}`}
          d={d}
          fill="none"
          stroke={SHADOW_COLOUR}
          strokeWidth={DASH.thickness + SHADOW_EXTRA}
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      ))}
      {legs.map(({ d, dash }, index) => (
        <Path
          key={`dash-${index}`}
          d={d}
          fill="none"
          stroke={colors.textPrimary}
          strokeWidth={DASH.thickness}
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      ))}
    </Svg>
  );
}
