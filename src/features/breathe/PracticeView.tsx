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
import { Wash } from '@/features/journal-session/Wash';
import { balanceLines, lineCapacity } from '@/features/become/phrases';
import { qa } from '@/testing/qa';

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
  /** How dark the screen was left, 0 to 1, for a screen that follows to lift it rather than cut. */
  dark?: number;
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
  /**
   * The system Back button, where it means leaving rather than ending (Arrive: Back leaves the morning
   * session, as it does from the book). The sound stops first. Without it, Back ends like End.
   */
  onBack?: () => void;
};

/**
 * During a practice. The sound leads; the screen follows it and then gets out of the way: after the
 * first breaths the word goes and the screen recedes almost to black, keeping only the tide line. A
 * tap brings it back with a quiet End.
 */
export function PracticeView(props: Props) {
  const { timeline, pace, sound, voice, first, onEnd } = props;
  const { endLabel = breatheCopy.end, tapToEnd = false, onBack } = props;
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const screenReader = useScreenReader();
  const ink = useSkyInk();
  const frame = useTideFrame();
  const dark = useSharedValue(0);
  // The harness can open a practice already receded (?receded=1), as it is after thirty seconds.
  const [qaReceded] = useState(
    () => qa.enabled && new URLSearchParams(window.location.search).has('receded'),
  );
  const [receded, setReceded] = useState(qaReceded);
  const [early, setEarly] = useState(!qaReceded);
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
      if (!run.timeline.current.endsInDark) {
        onEndRef.current({ finished: true, rounds, dark: dark.get() });
      }
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
    if (qaReceded) return;
    recedeLater(RECEDE_AFTER_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qaReceded, recedeLater]);

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

  const { stop } = run;
  const latestView = useRef(view);
  useEffect(() => {
    latestView.current = view;
  });
  const end = useCallback(() => {
    const now = latestView.current;
    const rounds = now.moment?.round ?? 0;
    const finished = now.status === 'done';
    if (!finished) stop();
    onEndRef.current({ finished, rounds, dark: dark.get() });
  }, [dark, stop]);

  const touch = () => {
    // A practice that has gone dark and quiet at its end opens onto what comes after.
    if (ended || tapToEnd) return end();
    setReceded(false);
    recedeLater(BACK_FOR_MS);
  };

  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const leave = onBackRef.current;
      if (!leave) {
        end();
        return true;
      }
      stop();
      leave();
      return true;
    });
    return () => subscription.remove();
  }, [end, stop]);

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
      {/* A breath of shade low on the screen, so the word, the line and End read on Day's bright
          ground as on Night's. It recedes with the rest. */}
      <Wash
        kind="ground"
        visible={showing}
        style={[styles.ground, { height: frame.height * 0.5 }]}
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
              {balanceLines(caption, lineCapacity(frame.width - 80, 21))}
            </EchoText>
          </View>
        )}
        {first && early && (
          <View pointerEvents="none" style={[styles.safety, { top: frame.low + 28 }]}>
            <EchoText variant="caption" align="center" style={[styles.safetyText, ink.shadow]}>
              {balanceLines(breatheCopy.safety, lineCapacity(frame.width - 96, 12.5, false))}
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
  ground: { bottom: 0 },
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
