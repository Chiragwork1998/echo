import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';

const WORD_FONT = 'CormorantGaramond_400Regular';
/** A word settles in over this long, rising a hair into place. */
export const WORD_IN_MS = 520;
const WORD_RISE = 6;
/** It leaves a little quicker than it came, lifting a hair as it goes. */
const WORD_LIFT = 4;
/** How long the old word takes to go before the next comes in, and how long the last word takes to go. */
export const WORD_OUT_MS = { swap: 260, recede: 360 } as const;
/**
 * A word that comes back after the screen has been away waits this long, so the dark has begun to
 * lift before it arrives: a person who has just touched the screen is not met by a bright word.
 */
export const WORD_BACK_LAG_MS = 360;

const SHADOW = {
  textShadowColor: 'rgba(2,10,24,0.55)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

type Props = {
  text: string;
  /** False fades it out and lifts it a hair. The caller takes it away once it has gone. */
  visible: boolean;
  /** How long it takes to go. */
  outMs: number;
  /** It is coming back after the screen was away: wait for the light. */
  back: boolean;
  /** Reduce Motion: it only fades, over 180 ms, and does not move. */
  reduced: boolean;
  top: number;
};

/**
 * One word on the sky. It settles in from a hair below and, going, lifts a hair as it fades: one
 * number carries both, from -1 (below, unseen) through 0 (here) to 1 (above, gone). A new word starts
 * from below again, so a swap is the old word going and the new one coming, never a cut.
 */
export function BreathWord({ text, visible, outMs, back, reduced, top }: Props) {
  const place = useSharedValue(-1);
  const shown = useRef(text);
  useEffect(() => {
    if (shown.current !== text) {
      // The old word has gone: the new one begins unseen, below.
      shown.current = text;
      place.set(-1);
    }
    place.set(
      visible
        ? withDelay(
            back && !reduced ? WORD_BACK_LAG_MS : 0,
            withTiming(0, {
              duration: reduced ? tokens.motion.fast : WORD_IN_MS,
              easing: EASE,
              reduceMotion: ReduceMotion.Never,
            }),
          )
        : withTiming(1, {
            duration: reduced ? tokens.motion.fast : outMs,
            easing: Easing.inOut(Easing.quad),
            reduceMotion: ReduceMotion.Never,
          }),
    );
  }, [back, outMs, place, reduced, text, visible]);
  const style = useAnimatedStyle(() => {
    const at = place.get();
    return {
      opacity: 1 - Math.abs(at),
      transform: [{ translateY: reduced ? 0 : at < 0 ? -at * WORD_RISE : -at * WORD_LIFT }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.word, { top: top - 24 }, style]}>
      <EchoText variant="displayM" align="center" style={[styles.wordText, SHADOW]}>
        {text}
      </EchoText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  word: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  wordText: { fontFamily: WORD_FONT, fontSize: 34, lineHeight: 42, letterSpacing: 0.3 },
});
