import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { GlassBlur } from '@/components/GlassCard';
import { TrackedText } from '@/components/TrackedText';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

// Owner-directed design (docs/OWNER_DECISIONS.md, D-002). Size and position follow the Landing golden.
const WIDTH = 316;
const HEIGHT = tokens.size.primaryButtonHeight;
const RADIUS = HEIGHT / 2;
const RIM = 1;
const BREATH_MS = 3800;
const HALO_REST = 0.42;
const HALO_PEAK = 0.8;
const PRESS_SCALE = 0.985;
const LABEL_TRACKING = 9;
const HAIRLINE_WIDTH = 26;
const SMOKED_GLASS_BLUR = 16;

const RIM_STOPS = [
  'rgba(255,244,223,0.95)',
  'rgba(255,244,223,0.28)',
  'rgba(232,204,160,0.2)',
  'rgba(232,204,160,0.72)',
] as const;
const BODY_STOPS = [
  'rgba(255,240,214,0.12)',
  'rgba(255,240,214,0.02)',
  'rgba(5,14,29,0.24)',
] as const;

/** The hairline beside the label, echoing the rule under the ECHO wordmark. */
function Hairline({ color, flip }: { color: string; flip?: boolean }) {
  return (
    <LinearGradient
      colors={['transparent', color]}
      start={{ x: flip ? 1 : 0, y: 0.5 }}
      end={{ x: flip ? 0 : 1, y: 0.5 }}
      style={styles.hairline}
    />
  );
}

export function BeginButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const breath = useSharedValue(HALO_REST);
  const press = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    breath.set(
      withRepeat(
        withTiming(HALO_PEAK, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [breath, reducedMotion]);

  const halo = useAnimatedStyle(() => ({
    opacity: Math.min(1, breath.get() + press.get() * 0.3),
  }));
  const lift = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - PRESS_SCALE) * press.get() }],
  }));

  const pressTo = (to: number) =>
    press.set(withTiming(to, { duration: tokens.motion.fast, reduceMotion: ReduceMotion.System }));

  return (
    <Animated.View style={[styles.root, lift]}>
      <Animated.View style={[styles.halo, { boxShadow: tokens.shadow.glow }, halo]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={() => pressTo(1)}
        onPressOut={() => pressTo(0)}
      >
        <LinearGradient
          colors={RIM_STOPS}
          locations={[0, 0.38, 0.62, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.rim}
        >
          <View style={styles.body}>
            <GlassBlur radius={SMOKED_GLASS_BLUR} tint="dark" />
            <LinearGradient colors={BODY_STOPS} style={StyleSheet.absoluteFill} />
            <View style={styles.sheen} />
            <Hairline color={colors.accentWarm} />
            <TrackedText
              text={label}
              tracking={LABEL_TRACKING}
              variant="button"
              serif
              style={styles.label}
            />
            <Hairline color={colors.accentWarm} flip />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { width: WIDTH, alignSelf: 'center' },
  halo: { ...StyleSheet.absoluteFill, borderRadius: RADIUS },
  rim: { borderRadius: RADIUS, padding: RIM },
  body: {
    height: HEIGHT - RIM * 2,
    borderRadius: RADIUS - RIM,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: RADIUS,
    right: RADIUS,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  hairline: { width: HAIRLINE_WIDTH, height: StyleSheet.hairlineWidth * 1.5 },
  label: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 18,
    lineHeight: 22,
  },
});
