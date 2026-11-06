import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

const SCRIM_COLOUR = '#040E1C'; // the dark end of the handoff's readability gradients

/**
 * A soft, feathered dark patch that fills its parent. Laid behind text on photography so it stays
 * legible without darkening the plate anywhere else (docs/SPEC_CONFLICTS.md, C-05). Decorative.
 */
export function SoftScrim({ alpha }: { alpha: number }) {
  // Ids must be unique per instance, and url(#...) cannot hold the colons React puts in useId.
  const id = `scrim${useId().replaceAll(':', '')}`;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={SCRIM_COLOUR} stopOpacity={alpha} />
          <Stop offset="0.55" stopColor={SCRIM_COLOUR} stopOpacity={alpha * 0.72} />
          <Stop offset="1" stopColor={SCRIM_COLOUR} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
