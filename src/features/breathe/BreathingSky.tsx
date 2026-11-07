import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { mixColor } from '@/design/mixColor';
import { plateColour } from '@/design/plateColour';
import { usePlateFrame } from '@/design/usePlatePoint';
import { useTheme } from '@/design/theme';
import { useReduceMotion } from '@/design/useReduceMotion';

/**
 * The sky breathing. The scrim is the plate's own colour, deepened toward its ink: it lifts a little
 * on the breath in and settles on the breath out. Measured by eye on both Home plates.
 */
const SKY = {
  night: { toward: 0.35, rest: 0.46, full: 0.18 },
  day: { toward: 0.6, rest: 0.5, full: 0.2 },
} as const;
/** The tide line rests this far up the screen with the lungs empty, and rises this far as they fill. */
const TIDE_AT = 0.78;
const TIDE_RISE = 64;
const TIDE_WIDTH = 0.64;
const TIDE_LIGHT = { night: 'rgba(255,236,204,', day: 'rgba(255,248,232,' } as const;
/** The word sits this far above the tide line at its highest. */
const WORD_ABOVE_TIDE = 58;
const WORD_FONT = 'CormorantGaramond_400Regular';
const WORD_MS = 520;
const WORD_RISE = 6;
const SHADOW = {
  textShadowColor: 'rgba(2,10,24,0.55)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

/** Where the tide line and the word sit, for a screen this tall. */
export function useTideFrame() {
  const { height, width } = usePlateFrame();
  const low = Math.round(height * TIDE_AT);
  return { width, height, low, high: low - TIDE_RISE, word: low - TIDE_RISE - WORD_ABOVE_TIDE };
}

/** One word, settling in as it arrives. Reduce Motion: it only fades. */
function Word({ text, reduced, top }: { text: string; reduced: boolean; top: number }) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(1, {
        duration: WORD_MS,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: reduced ? 0 : (1 - shown.get()) * WORD_RISE }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.word, { top: top - 24 }, style]}>
      <EchoText variant="displayM" align="center" style={[styles.wordText, SHADOW]}>
        {text}
      </EchoText>
    </Animated.View>
  );
}

type Props = {
  /** The breath, 0 empty to 1 full, read every frame. */
  level: SharedValue<number>;
  /** 0 is the screen as it is; 1 is black. The practice recedes toward almost black, Sleep to black. */
  dark: SharedValue<number>;
  /** Shown only in the first breaths. Null leaves the sky and the tide alone. */
  word: string | null;
  /** The thin line of light low on the screen. Rehearse breathes the sky without it. */
  tide?: boolean;
  /** Lines shown low on the sky, such as a voice line read rather than heard. */
  children?: ReactNode;
};

/**
 * What a practice looks like: the plate, the sky breathing over it, a thin tide line of light low on
 * the screen rising and falling with the breath, and one word. No orb, no ring, no counter. It draws
 * no photograph: Home's plate, and the Night loop, are beneath it.
 */
export function BreathingSky({ level, dark, word, tide: showTide = true, children }: Props) {
  const { name, target, colors } = useTheme();
  const reduced = useReduceMotion();
  const frame = useTideFrame();
  const sky = SKY[name];
  const tint = mixColor(plateColour(target, 'home', colors.textInk), colors.textInk, sky.toward);
  const light = TIDE_LIGHT[name];

  const scrim = useAnimatedStyle(() => ({
    opacity: sky.rest + (sky.full - sky.rest) * level.get(),
  }));
  const veil = useAnimatedStyle(() => ({ opacity: dark.get() }));
  // The line itself moves with the breath. Reduce Motion: it stays put and brightens instead.
  const tide = useAnimatedStyle(() => {
    const breath = level.get();
    const fade = 1 - dark.get() * 0.55;
    return reduced
      ? { opacity: (0.35 + 0.65 * breath) * fade, transform: [{ translateY: -TIDE_RISE / 2 }] }
      : { opacity: (0.7 + 0.3 * breath) * fade, transform: [{ translateY: -TIDE_RISE * breath }] };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tint }, scrim]}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.black, veil]}
        testID="breath-veil"
      />
      {showTide && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tide,
            { top: frame.low, left: (frame.width * (1 - TIDE_WIDTH)) / 2 },
            tide,
          ]}
          testID="breath-tide"
        >
          <LinearGradient
            colors={[`${light}0)`, `${light}0.9)`, `${light}0)`]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.line, { width: frame.width * TIDE_WIDTH }]}
          />
        </Animated.View>
      )}
      {word !== null && <Word key={word} text={word} reduced={reduced} top={frame.word} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  black: { backgroundColor: '#000000' },
  tide: { position: 'absolute', height: 6, justifyContent: 'center' },
  line: {
    height: 1.5,
    borderRadius: 1,
    boxShadow: '0 0 10px rgba(255,232,196,0.55)',
  },
  word: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  wordText: { fontFamily: WORD_FONT, fontSize: 34, lineHeight: 42, letterSpacing: 0.3 },
});
