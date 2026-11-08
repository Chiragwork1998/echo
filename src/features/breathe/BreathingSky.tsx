import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { mixColor } from '@/design/mixColor';
import { plateColour } from '@/design/plateColour';
import { usePlateFrame } from '@/design/usePlatePoint';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { BreathWord, WORD_OUT_MS } from './BreathWord';
import { RecedeVeil } from './RecedeVeil';
import { tideLight } from './veilBands';
import { useSettledText } from './useSettledText';

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

/** Where the tide line and the word sit, for a screen this tall. */
export function useTideFrame() {
  const { height, width } = usePlateFrame();
  const low = Math.round(height * TIDE_AT);
  return { width, height, low, high: low - TIDE_RISE, word: low - TIDE_RISE - WORD_ABOVE_TIDE };
}

type Props = {
  /** The breath, 0 empty to 1 full, read every frame. */
  level: SharedValue<number>;
  /**
   * 0 is the screen as it is; 1 is black. The practice recedes toward almost black, Sleep to black.
   * Left out, the sky has no veil at all (Rehearse breathes the sky and never darkens it).
   */
  dark?: SharedValue<number>;
  /** Sleep, once its fade to black has begun: the veil goes on to true black and the tide line goes. */
  full?: boolean;
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
export function BreathingSky({
  level,
  dark,
  full = false,
  word,
  tide: showTide = true,
  children,
}: Props) {
  const { name, target, colors } = useTheme();
  const reduced = useReduceMotion();
  const frame = useTideFrame();
  const sky = SKY[name];
  const tint = mixColor(plateColour(target, 'home', colors.textInk), colors.textInk, sky.toward);
  const light = TIDE_LIGHT[name];

  const scrim = useAnimatedStyle(() => ({
    opacity: sky.rest + (sky.full - sky.rest) * level.get(),
  }));
  // The line itself moves with the breath. Reduce Motion: it stays put and brightens instead.
  const tide = useAnimatedStyle(() => {
    const breath = level.get();
    const fade = tideLight(dark ? dark.get() : 0, full);
    return reduced
      ? { opacity: (0.35 + 0.65 * breath) * fade, transform: [{ translateY: -TIDE_RISE / 2 }] }
      : { opacity: (0.7 + 0.3 * breath) * fade, transform: [{ translateY: -TIDE_RISE * breath }] };
  });

  // The word stays on screen while it fades out, then goes; a new word waits for the old to leave.
  const out = reduced ? tokens.motion.fast : word === null ? WORD_OUT_MS.recede : WORD_OUT_MS.swap;
  const line = useSettledText(word, out + 20);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tint }, scrim]}
      />
      {dark && <RecedeVeil dark={dark} full={full} />}
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
      {line.text !== null && (
        <BreathWord
          text={line.text}
          visible={line.visible}
          outMs={out}
          back={line.back}
          reduced={reduced}
          top={frame.word}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tide: { position: 'absolute', height: 6, justifyContent: 'center' },
  line: {
    height: 1.5,
    borderRadius: 1,
    boxShadow: '0 0 10px rgba(255,232,196,0.55)',
  },
});
