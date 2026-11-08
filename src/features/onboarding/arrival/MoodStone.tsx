import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { SoftScrim } from '@/components/SoftScrim';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

// Cormorant at this size matches the golden's words, about 69 pt across for "Unsettled".
const LABEL_SIZE = 19;
const LABEL_LINE = 24;
// The label is a hair above the stone's centre in the golden, as the eye reads the top face.
const LABEL_LIFT = 3;
// Each word sits on a soft dark patch, so white serif stays readable on pale stone and sunlit water.
const SCRIM = { alpha: { day: 0.44, night: 0.36 }, x: 22, y: 12 };
const LABEL_SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.55)',
  textShadowRadius: 7,
  textShadowOffset: { width: 0, height: 1 },
} as const;
const PRESS_GLOW = 0.16;

type Props = {
  label: string;
  /** Touch box on screen. The label is centred in it, on the stone. */
  box: { left: number; top: number; width: number; height: number };
  /** Half-width and half-height of the stone on screen, for the press highlight. */
  rx: number;
  ry: number;
  selected: boolean;
  onSelect: () => void;
};

/**
 * One stone, as a radio control. The word is set on the stone itself; the glow and rings that mark
 * a chosen stone are drawn beneath it by StoneRipple, so selection reads by shape, not colour.
 */
export function MoodStone({ label, box, rx, ry, selected, onSelect }: Props) {
  const { name, colors } = useTheme();
  const press = useSharedValue(0);
  const glow = useAnimatedStyle(() => ({ opacity: press.get() * PRESS_GLOW }));
  const to = (value: number) =>
    press.set(
      withTiming(value, { duration: tokens.motion.instant, reduceMotion: ReduceMotion.System }),
    );

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      onPress={onSelect}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      style={[styles.hit, box]}
    >
      <Animated.View
        testID="stone-press"
        pointerEvents="none"
        style={[
          styles.press,
          // 50% gives elliptical corners, so the glow follows the stone's outline, not a stadium.
          {
            width: rx * 2,
            height: ry * 2,
            borderRadius: '50%',
            backgroundColor: colors.textPrimary,
          },
          glow,
        ]}
      />
      <View style={{ top: -LABEL_LIFT }}>
        <View
          pointerEvents="none"
          style={[
            styles.scrim,
            { left: -SCRIM.x, right: -SCRIM.x, top: -SCRIM.y, bottom: -SCRIM.y },
          ]}
        >
          <SoftScrim alpha={SCRIM.alpha[name]} />
        </View>
        <EchoText variant="bodyL" serif numberOfLines={1} style={[styles.label, LABEL_SHADOW]}>
          {label}
        </EchoText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  press: { position: 'absolute' },
  scrim: { position: 'absolute' },
  label: { fontSize: LABEL_SIZE, lineHeight: LABEL_LINE },
});
