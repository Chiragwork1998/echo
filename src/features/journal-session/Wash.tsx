import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

/**
 * A breath of shade, not a panel: no edge, no box. It rises behind words that are on the sky or
 * controls on the ground, so cream stays readable over bright cloud and flowers, and is gone
 * while the mountains are alone. Set an alpha to 0 to remove it. Measured against both plates.
 */
const TONE = {
  night: { rgb: '2,9,22', sky: [0.3, 0.2], ground: 0.42 },
  day: { rgb: '7,30,66', sky: [0.52, 0.38], ground: 0.6 },
} as const;
/** The ground shade fades up over this much height, then holds flat to the bottom of the screen. */
export const GROUND_FADE = 220;
const COME_MS = 900;
const GO_MS = 600;
/**
 * How the quiet row and the shade under it come and go. They are one thing, so they share both the
 * lengths and the curve: the words are never left standing on bright foliage while the shade is
 * still on its way, and no dark band is left behind them when they have gone. Under Reduce Motion
 * both are the house's short fade.
 */
export const QUIET_FADE = { come: 900, go: 200, reduced: tokens.motion.fast } as const;

type Props = {
  kind: 'sky' | 'ground';
  visible: boolean;
  /** Rides with the quiet row: the same curve and the same quick leave (QUIET_FADE). */
  quiet?: boolean;
  /** How long it takes to go, where something else is going as slowly (Breathe's dark): 600 ms. */
  goMs?: number;
  /** Where it sits: `top` or `bottom`, and `height`. It always spans the width. */
  style: ComponentProps<typeof Animated.View>['style'];
};

export function Wash({ kind, visible, quiet = false, goMs = GO_MS, style }: Props) {
  const { name } = useTheme();
  const reduced = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    const come = quiet ? QUIET_FADE.come : COME_MS;
    const go = quiet ? QUIET_FADE.go : goMs;
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: reduced ? (quiet ? QUIET_FADE.reduced : 160) : visible ? come : go,
        easing: quiet ? Easing.out(Easing.quad) : Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [goMs, quiet, reduced, shown, visible]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));

  const tone = TONE[name];
  const colours =
    kind === 'sky'
      ? ([
          `rgba(${tone.rgb},${tone.sky[0]})`,
          `rgba(${tone.rgb},${tone.sky[1]})`,
          `rgba(${tone.rgb},0)`,
        ] as const)
      : ([`rgba(${tone.rgb},0)`, `rgba(${tone.rgb},${tone.ground})`] as const);
  const ground = `rgba(${tone.rgb},${tone.ground})`;
  const locations = kind === 'sky' ? ([0, 0.6, 1] as const) : ([0, 1] as const);

  return (
    <Animated.View pointerEvents="none" style={[styles.band, style, fade]}>
      {kind === 'sky' ? (
        <LinearGradient colors={colours} locations={locations} style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <LinearGradient colors={colours} locations={locations} style={styles.fade} />
          {/* Flat beneath the fade, so no edge shows when the keyboard is away. */}
          <View style={[styles.flat, { backgroundColor: ground }]} />
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0 },
  fade: { height: GROUND_FADE },
  flat: { flex: 1 },
});
