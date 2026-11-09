import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { Swap } from '@/components/Swap';
import { EASE } from '@/design/ease';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { paragraphsOf, useEntry, type Entry } from '@/features/journal';
import { useBeingSetOut } from '@/services/formatQueue';

import { LIGHT_SANS } from './fonts';
import { ReadingFade } from './ReadingFade';
import { completionText } from './text';

/** Measured from the card: its body's inset from the glass's edges. */
const INSET = 33;
/**
 * The person's own words in the book's Cormorant, set as the reader's page sets them a step smaller,
 * so that the echo above them, in the card's light sans, is plainly ECHO's voice and these are theirs.
 */
const WORDS = {
  fontFamily: 'CormorantGaramond_500Medium',
  fontSize: 19,
  lineHeight: 28,
  letterSpacing: 0.15,
} as const;
/** The soft edge the words melt into at the top and the foot of their window. */
const FADE = tokens.space[16];
const NOTE = { fontFamily: LIGHT_SANS, fontSize: 11.5, lineHeight: 15, opacity: 0.8 } as const;
/** Folding away, the words go a little sooner than the space they leave. */
const FOLD_FADE_MS = 200;

/** The words, as paragraphs. They cross-fade when the version set out arrives in place of the first. */
function Words({ kept, room }: { kept: Entry; room: number | null }) {
  const settingOut = useBeingSetOut(kept.id);
  const words = (
    <Swap contentKey={kept.updatedAt}>
      <View style={styles.paragraphs}>
        {paragraphsOf(kept.body).map((paragraph, index) => (
          <EchoText key={index} variant="bodyL" style={WORDS} maxFontSizeMultiplier={1.6}>
            {paragraph}
          </EchoText>
        ))}
      </View>
    </Swap>
  );
  return (
    <View>
      {settingOut ? (
        <EchoText
          variant="bodyM"
          color="textSecondary"
          style={[NOTE, styles.note]}
          accessibilityLiveRegion="polite"
        >
          {completionText.settingOut}
        </EchoText>
      ) : null}
      {room === null ? (
        <View style={styles.flowing}>{words}</View>
      ) : (
        <ReadingFade fade={FADE}>
          <ScrollView
            testID="read-back-scroll"
            style={[styles.window, { maxHeight: room }]}
            contentContainerStyle={styles.scrolled}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {words}
          </ScrollView>
        </ReadingFade>
      )}
    </View>
  );
}

type Props = {
  entryId: string;
  open: boolean;
  /**
   * How tall the words may be before they scroll in a window of their own, which the card fits to the
   * room it has. null where the whole page scrolls (large text, landscape): there they simply flow.
   */
  room: number | null;
};

/**
 * The entry just kept, opened in the card under its echo, and closed again (D-017): the one change to
 * the golden card. The card is anchored at its foot, so it opens upward: the space for the words eases
 * open while they rise into it and fade in, 320 ms on the shared ease, as a panel's height does when its
 * face changes (PanelSwap). Closing is the same the other way, and only once it has closed are the words
 * let go of. Under Reduce Motion nothing travels: the words fade in place, in 180 ms. They are read from
 * the journal only while they are open, and a version set out while they are open takes their place.
 */
export function ReadBack({ entryId, open, room }: Props) {
  const reduced = useReduceMotion();
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  // Opened from the journal only while it is here, and decrypted only then.
  const kept = useEntry(present ? entryId : null).data;
  // How tall the words are when nothing holds them: what the space eases open to.
  const [natural, setNatural] = useState<number | null>(null);
  const height = useSharedValue(0);
  const shown = useSharedValue(0);

  useEffect(() => {
    if (!present) return;
    const travel = {
      duration: tokens.motion.standard,
      easing: EASE,
      reduceMotion: ReduceMotion.Never,
    };
    if (open) {
      if (natural === null) return;
      height.set(reduced ? natural : withTiming(natural, travel));
      shown.set(
        withTiming(1, {
          duration: reduced ? tokens.motion.fast : tokens.motion.standard,
          easing: EASE,
          reduceMotion: ReduceMotion.Never,
        }),
      );
      return;
    }
    const letGo = () => {
      setPresent(false);
      setNatural(null);
    };
    const closed = (finished?: boolean) => {
      'worklet';
      // Not when it was opened again before it had closed.
      if (finished) runOnJS(letGo)();
    };
    const fade = {
      duration: reduced ? tokens.motion.fast : FOLD_FADE_MS,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.Never,
    };
    if (reduced) {
      shown.set(withTiming(0, fade, closed));
      return;
    }
    shown.set(withTiming(0, fade));
    height.set(withTiming(0, travel, closed));
  }, [height, natural, open, present, reduced, shown]);

  const space = useAnimatedStyle(() => ({ height: height.get() }));
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));

  if (!present) return null;
  return (
    <Animated.View
      testID="read-back"
      style={[styles.space, space]}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {/* Measured once the words are there, so that the space opens once, straight to them. */}
      {kept ? (
        <Animated.View
          style={[styles.words, fade]}
          onLayout={(event) => setNatural(event.nativeEvent.layout.height)}
        >
          <Words kept={kept} room={room} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  space: { overflow: 'hidden' },
  // Laid out at their own height whatever the space around them has eased to, so that it can be known.
  words: { flexShrink: 0, paddingTop: tokens.space[8] },
  note: { paddingHorizontal: INSET, marginBottom: tokens.space[4] },
  window: { flexGrow: 0, flexShrink: 0 },
  scrolled: { paddingHorizontal: INSET, paddingVertical: FADE },
  flowing: { paddingHorizontal: INSET, paddingVertical: tokens.space[12] },
  paragraphs: { gap: tokens.space[12] },
});
