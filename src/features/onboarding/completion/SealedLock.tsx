import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { EASE } from '@/design/ease';
import { useReduceMotion } from '@/design/useReduceMotion';

/**
 * The lock of assets/icons/lock.svg, redrawn from its own coordinates in two pieces so that it can
 * close: the body and keyhole, and the shackle, which drops shut. Both are drawn on its 24 point
 * board. Together they are exactly the asset (the test reads the asset to prove it).
 */
export const LOCK = {
  size: 24,
  stroke: 1.5,
  body: { x: 5, y: 10, width: 14, height: 11, rx: 2 },
  keyhole: 'M12 14v3',
  shackle: 'M8 10V7a4 4 0 018 0v3',
} as const;

/** The shackle stands open this far above where it shuts, in the lock's own units. */
const OPEN = 2.5;
const BODY_MS = 220;
const SHACKLE_MS = 240;

type Props = {
  /** The size it is drawn at, in points. */
  size: number;
  color: string;
  /** When it begins to close, from mount. */
  startAt: number;
};

/**
 * The 'Saved privately' lock, which closes as the entry is held: the body and keyhole come in, and the
 * shackle drops shut over them. Reduce Motion: drawn closed.
 */
export function SealedLock({ size, color, startAt }: Props) {
  const reduced = useReduceMotion();
  const body = useSharedValue(reduced ? 1 : 0);
  const shackle = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      body.set(1);
      shackle.set(1);
      return;
    }
    const timing = (duration: number, easing: WithTimingConfig['easing']) => ({
      duration,
      easing,
      reduceMotion: ReduceMotion.Never,
    });
    body.set(withDelay(startAt, withTiming(1, timing(BODY_MS, Easing.out(Easing.quad)))));
    shackle.set(withDelay(startAt, withTiming(1, timing(SHACKLE_MS, EASE))));
  }, [body, reduced, shackle, startAt]);

  const scale = size / LOCK.size;
  const bodyStyle = useAnimatedStyle(() => ({ opacity: body.get() }));
  const shackleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, shackle.get() * 4),
    transform: [{ translateY: OPEN * scale * (shackle.get() - 1) }],
  }));
  const board = `0 0 ${LOCK.size} ${LOCK.size}`;
  const line = {
    stroke: color,
    strokeWidth: LOCK.stroke,
    strokeLinecap: 'round' as const,
    fill: 'none',
  };

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      <Animated.View style={[styles.layer, bodyStyle]}>
        <Svg width={size} height={size} viewBox={board}>
          <Rect {...LOCK.body} {...line} />
          <Path d={LOCK.keyhole} {...line} />
        </Svg>
      </Animated.View>
      <Animated.View testID="sealed-lock-shackle" style={[styles.layer, shackleStyle]}>
        <Svg width={size} height={size} viewBox={board}>
          <Path d={LOCK.shackle} {...line} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ layer: { ...StyleSheet.absoluteFill } });
