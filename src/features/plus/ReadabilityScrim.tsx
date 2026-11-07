import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

import { tokens } from '@/design/tokens';

import { gradientFrom } from './readability';

const TOP = gradientFrom(tokens.gradient.readabilityTop);
const BOTTOM = gradientFrom(tokens.gradient.readabilityBottom);

/**
 * ECHO's readability scrim: the handoff's top and bottom gradients over the plate, never an opaque
 * wash (product-handoff/specs/SCREEN_SPECS.md). The middle of the plate stays as it is. Decorative.
 */
export function ReadabilityScrim() {
  return (
    <>
      <LinearGradient {...TOP} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <LinearGradient {...BOTTOM} pointerEvents="none" style={StyleSheet.absoluteFill} />
    </>
  );
}
