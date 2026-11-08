import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

type Json = { type: string; props: Record<string, unknown>; children?: unknown };

/**
 * How see-through the things above each piece of glass are, outermost first, for every piece of glass
 * on screen. Android's BlurView loses its blur while any ancestor's opacity is under 1, so a piece of
 * glass is only right when every number on its list is 1. A piece of glass is what expo-blur draws,
 * which under jest is a view that names its blur method.
 */
export function glassAncestors(): number[][] {
  const found: number[][] = [];
  const walk = (node: unknown, above: number[], within = false): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((child) => walk(child, above, within));
    const { props, children } = node as Json;
    // expo-blur's view is one piece of glass, however many views it is drawn with.
    const blur = 'blurMethod' in props;
    if (blur && !within) found.push(above);
    const opacity = (StyleSheet.flatten(props.style as never) as { opacity?: number } | undefined)
      ?.opacity;
    walk(children, opacity === undefined ? above : [...above, opacity], within || blur);
  };
  walk(screen.toJSON(), []);
  return found;
}

/** The least opacity above any piece of glass: 1 when none is under a fading ancestor. */
export function mostFadedGlass(): number {
  const all = glassAncestors().flat();
  return all.length ? Math.min(...all) : 1;
}
