import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoText } from '@/components/EchoText';
import { OneLineLabel } from '@/components/OneLineLabel';
import { useReduceMotion } from '@/design/useReduceMotion';
import { CONTROLS, useSkyInk } from '@/features/journal-session/sky';
import { useScreenReader } from '@/features/journal-session/useScreenReader';

import { breatheCopy } from './breatheCopy';
import { BreathingSky, useTideFrame } from './BreathingSky';
import type { Timeline } from './timeline';
import { usePracticeRun } from './usePracticeRun';

/** After about this long the word goes and the screen dims almost to black. */
export const RECEDE_AFTER_MS = 30_000;
/** A tap brings the screen back for this long. */
const BACK_FOR_MS = 7000;
/** Almost black: the faint tide line still shows. */
const RECEDED = 0.9;
const RECEDE_MS = 2600;
const RETURN_MS = 600;

export type PracticeEnd = {
  /** The practice ran its course, rather than being ended with End. */
  finished: boolean;
  /** Rounds breathed, so a practice barely begun is not counted. */
  rounds: number;
};

type Props = {
  timeline: Timeline;
  pace: number;
  sound: boolean;
  voice: boolean;
  /** The person's first practice: it carries the safety line. */
  first: boolean;
  onEnd: (end: PracticeEnd) => void;
  /** The quiet word that ends it. Become's Arrive says Skip. */
  endLabel?: string;
  /** Any tap ends it, rather than first bringing the screen back (Arrive: a tap goes into the book). */
  tapToEnd?: boolean;
};

/**
 * During a practice. The sound leads; the screen follows it and then gets out of the way: after the
 * first breaths the word goes and the screen recedes almost to black, keeping only the tide line. A
 * tap brings it back with a quiet End.
 */
export function PracticeView(props: Props) {
  const { timeline, pace, sound, voice, first, onEnd } = props;
  const { endLabel = breatheCopy.end, tapToEnd = false } = props;
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const screenReader = useScreenReader();
  const ink = useSkyInk();
  const frame = useTideFrame();
  const dark = useSharedValue(0);
  const [receded, setReceded] = useState(false);
  const [early, setEarly] = useState(true);
  const [ended, setEnded] = useState(false);
  const fadeStarted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  const run = usePracticeRun({
    timeline,
    pace,
    sound,
    voice,
    screenReader,
    onDone: () => {
      setEnded(true);
      const rounds = run.timeline.current.segments.reduce((sum, s) => sum + s.rounds, 0);
      // A practice that ends in the dark stays dark until it is touched.
      if (!run.timeline.current.endsInDark) onEndRef.current({ finished: true, rounds });
    },
  });
  const { view, level, start } = run;

  useEffect(() => {
    start();
  }, [start]);

  // The screen recedes after the first breaths, and again a while after each tap.
  const recedeLater = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setEarly(false);
      setReceded(true);
    }, ms);
  }, []);
  useEffect(() => {
    recedeLater(RECEDE_AFTER_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [recedeLater]);

  // A fade (Sleep) takes the screen to black over its own length, and keeps it there.
  const fade = timeline.cues.find((cue) => cue.kind === 'fade');
  useEffect(() => {
    if (!fade || fadeStarted.current || run.elapsed() < fade.atMs) return;
    fadeStarted.current = true;
    setReceded(true);
  }, [fade, run, view.moment]);

  const caption = view.caption;
  const showing = !receded || caption !== null;
  useEffect(() => {
    const black = fadeStarted.current ? 1 : RECEDED;
    const ms = !showing ? (fadeStarted.current && fade ? fade.ms : RECEDE_MS) : RETURN_MS;
    dark.set(
      withTiming(showing ? 0 : black, {
        duration: reduced ? Math.min(ms, 900) : ms,
        easing: showing ? Easing.out(Easing.quad) : Easing.inOut(Easing.sin),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [dark, fade, reduced, showing]);

  const end = useCallback(() => {
    const rounds = run.view.moment?.round ?? 0;
    const finished = run.view.status === 'done';
    if (!finished) run.stop();
    onEndRef.current({ finished, rounds });
  }, [run]);

  const touch = () => {
    // A practice that has gone dark and quiet at its end opens onto what comes after.
    if (ended || tapToEnd) return end();
    setReceded(false);
    recedeLater(BACK_FOR_MS);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      end();
      return true;
    });
    return () => subscription.remove();
  }, [end]);

  const controls = screenReader || !receded;
  const shown = useSharedValue(controls ? 1 : 0);
  useEffect(() => {
    shown.set(
      withTiming(controls ? 1 : 0, {
        duration: controls ? 700 : 300,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [controls, shown]);
  const controlFade = useAnimatedStyle(() => ({ opacity: shown.get() }));

  return (
    <View style={styles.root}>
      <StatusBar hidden animated />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={endLabel}
        accessibilityElementsHidden={!screenReader}
        importantForAccessibility={screenReader ? 'no' : 'auto'}
        onPress={touch}
        style={StyleSheet.absoluteFill}
        testID="practice-sky"
      />
      <BreathingSky level={level} dark={dark} word={early || !receded ? view.word : null}>
        {caption !== null && (
          <View pointerEvents="none" style={[styles.caption, { top: frame.word - 120 }]}>
            <EchoText
              variant="bodyL"
              serif
              align="center"
              accessibilityLiveRegion="polite"
              style={[styles.captionText, { color: ink.text }, ink.shadow]}
            >
              {caption}
            </EchoText>
          </View>
        )}
        {first && early && (
          <View pointerEvents="none" style={[styles.safety, { top: frame.low + 28 }]}>
            <EchoText variant="caption" align="center" style={[styles.safetyText, ink.shadow]}>
              {breatheCopy.safety}
            </EchoText>
          </View>
        )}
      </BreathingSky>
      <Animated.View
        pointerEvents={controls ? 'box-none' : 'none'}
        accessibilityElementsHidden={!controls}
        importantForAccessibility={controls ? 'auto' : 'no-hide-descendants'}
        style={[styles.bottom, { bottom: insets.bottom + CONTROLS.aboveEdge }, controlFade]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={endLabel}
          onPress={end}
          hitSlop={8}
          style={styles.end}
          testID="practice-end"
        >
          <OneLineLabel
            variant="bodyL"
            serif
            style={[styles.endText, { color: ink.quiet }, ink.shadow]}
          >
            {endLabel}
          </OneLineLabel>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  caption: { position: 'absolute', left: 40, right: 40, alignItems: 'center' },
  captionText: { fontFamily: 'CormorantGaramond_500Medium', fontSize: 21, lineHeight: 28 },
  safety: { position: 'absolute', left: 48, right: 48, alignItems: 'center' },
  safetyText: { fontSize: 12.5, lineHeight: 17, letterSpacing: 0.2, opacity: 0.82 },
  bottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  end: {
    minHeight: CONTROLS.height,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endText: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: 0.7,
  },
});
