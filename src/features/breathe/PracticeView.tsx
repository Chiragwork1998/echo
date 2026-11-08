import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoText } from '@/components/EchoText';
import { OneLineLabel } from '@/components/OneLineLabel';
import { EASE } from '@/design/ease';
import { cue } from '@/design/haptics';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { CONTROLS, useSkyInk } from '@/features/journal-session/sky';
import { useScreenReader } from '@/features/journal-session/useScreenReader';
import { Wash } from '@/features/journal-session/Wash';
import { balanceLines, lineCapacity } from '@/features/become/phrases';
import { qa } from '@/testing/qa';

import { breatheCopy } from './breatheCopy';
import { BreathingSky, useTideFrame } from './BreathingSky';
import { Fade, FADE } from './Fade';
import { RESTING_DARK } from './veilBands';
import type { Timeline } from './timeline';
import { usePracticeRun } from './usePracticeRun';
import { useSettledText } from './useSettledText';

/** After about this long the word goes and the screen dims almost to black. */
export const RECEDE_AFTER_MS = 30_000;
/** A tap brings the screen back for this long. */
const BACK_FOR_MS = 7000;
/** Almost black: the faint tide line still shows. */
const RECEDED = RESTING_DARK;
/** The dark comes down over this long, ground first, and goes back in 600 ms, sky first. */
const RECEDE_MS = 3000;
const RETURN_MS = 600;
/**
 * After a touch the dark lifts first, and End comes back into the light after it: it is not met by a
 * bright word on a dark-adapted eye.
 */
const END_BACK_LAG_MS = 300;

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
  /**
   * Breathe's own hand-overs: the practice comes up over the bare plate, and lifts away before it
   * hands on, so the screen never jumps from near black to full light. Become's Arrive hands on
   * at once: its own dark is lifted over the book (PracticeEnd.dark).
   */
  eased?: boolean;
};

/** The harness: ?dark=0.5 holds the veil at that dark, and ?full=1 is Sleep's end. */
function qaPins(): { dark: number | null; full: boolean } {
  if (!qa.enabled) return { dark: null, full: false };
  const params = new URLSearchParams(window.location.search);
  const dark = params.get('dark');
  return { dark: dark === null ? null : Number(dark), full: params.has('full') };
}

/**
 * During a practice. The sound leads; the screen follows it and then gets out of the way: after the
 * first breaths the word goes and the screen recedes almost to black, keeping only the tide line. A
 * tap brings it back with a quiet End.
 */
export function PracticeView(props: Props) {
  const { timeline, pace, sound, voice, first, onEnd } = props;
  const { endLabel = breatheCopy.end, tapToEnd = false, onBack, eased = false } = props;
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const screenReader = useScreenReader();
  const ink = useSkyInk();
  const frame = useTideFrame();
  // The harness can open a practice already receded (?receded=1), as it is after thirty seconds,
  // and hold the veil at one dark (?dark=0.5) or at Sleep's end (?dark=1&full=1).
  const [pins] = useState(qaPins);
  const [qaReceded] = useState(
    () => qa.enabled && new URLSearchParams(window.location.search).has('receded'),
  );
  const dark = useSharedValue(pins.dark ?? 0);
  const [receded, setReceded] = useState(qaReceded);
  const [early, setEarly] = useState(!qaReceded);
  const [ended, setEnded] = useState(false);
  const [faded, setFaded] = useState(pins.full);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  // The practice comes up over the bare plate, and lifts away before it hands on. A held shot
  // (?receded) is at full strength. Opacity only; Reduce Motion: 180 ms.
  const presence = useSharedValue(qaReceded ? 1 : 0);
  const layer = useAnimatedStyle(() => ({ opacity: presence.get() }));
  useEffect(() => {
    if (qaReceded) return;
    presence.set(
      withTiming(1, {
        duration: reduced
          ? tokens.motion.fast
          : eased
            ? tokens.motion.atmosphere
            : tokens.motion.screen,
        easing: eased ? Easing.inOut(Easing.sin) : EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [eased, presence, qaReceded, reduced]);
  const [leaving, setLeaving] = useState(false);
  const lifting = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handOn = useCallback(
    (result: PracticeEnd) => {
      if (!eased) return onEndRef.current(result);
      if (lifting.current) return;
      const ms = reduced ? tokens.motion.fast : tokens.motion.atmosphere;
      setLeaving(true);
      presence.set(
        withTiming(0, {
          duration: ms,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.Never,
        }),
      );
      lifting.current = setTimeout(() => onEndRef.current(result), ms);
    },
    [eased, presence, reduced],
  );
  useEffect(
    () => () => {
      if (lifting.current) clearTimeout(lifting.current);
    },
    [],
  );

  const run = usePracticeRun({
    timeline,
    pace,
    sound,
    voice,
    screenReader,
    // A fade (Sleep) takes the screen to black over its own length, from the moment the practice
    // reaches it, wherever the person has touched, and keeps it there.
    onFade: () => {
      setFaded(true);
      setReceded(true);
    },
    onDone: () => {
      setEnded(true);
      const rounds = run.timeline.current.segments.reduce((sum, s) => sum + s.rounds, 0);
      // A practice that ends in the dark stays dark until it is touched.
      if (!run.timeline.current.endsInDark) {
        handOn({ finished: true, rounds, dark: dark.get() });
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

  const fade = timeline.cues.find((next) => next.kind === 'fade');

  const caption = view.caption;
  // A line shown as text lifts the dark so it can be read, except in Sleep: its lines are read over
  // the dark, and the screen must not light up for someone trying to fall asleep.
  const showing = !receded || (caption !== null && !timeline.endsInDark);
  useEffect(() => {
    if (pins.dark !== null) return;
    const black = faded ? 1 : RECEDED;
    const ms = showing ? RETURN_MS : faded && fade ? fade.ms : RECEDE_MS;
    // Reduce Motion: a plain fade of 180 ms, but Sleep's own fade to black is the practice's content.
    const quick = reduced && !(faded && !showing);
    dark.set(
      withTiming(showing ? 0 : black, {
        duration: quick ? tokens.motion.fast : ms,
        easing: showing ? Easing.out(Easing.quad) : Easing.inOut(Easing.sin),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [dark, fade, faded, pins.dark, reduced, showing]);

  const { stop } = run;
  const latestView = useRef(view);
  useEffect(() => {
    latestView.current = view;
  });
  const end = useCallback(() => {
    if (lifting.current) return;
    const now = latestView.current;
    const rounds = now.moment?.round ?? 0;
    const finished = now.status === 'done';
    if (!finished) stop();
    handOn({ finished, rounds, dark: dark.get() });
  }, [dark, handOn, stop]);

  const touch = () => {
    // A practice that has gone dark and quiet at its end opens onto what comes after.
    if (ended || tapToEnd) return end();
    // In the dark, or with eyes closed, the person knows the touch was heard.
    if (receded) cue('tick');
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
    const quick = reduced ? tokens.motion.fast : null;
    shown.set(
      controls
        ? withDelay(
            quick === null ? END_BACK_LAG_MS : 0,
            withTiming(1, { duration: quick ?? 700, reduceMotion: ReduceMotion.Never }),
          )
        : withTiming(0, { duration: quick ?? 300, reduceMotion: ReduceMotion.Never }),
    );
  }, [controls, reduced, shown]);
  const controlFade = useAnimatedStyle(() => ({ opacity: shown.get() }));

  // A line shown as text, and the first practice's safety line, fade out rather than vanish.
  const fadeOut = (reduced ? tokens.motion.fast : FADE.out) + 40;
  const captionLine = useSettledText(caption, fadeOut);
  const safetyLine = useSettledText(first && early ? breatheCopy.safety : null, fadeOut);

  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      style={[styles.root, layer]}
      testID="practice-layer"
    >
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
          ground as on Night's. It recedes with the rest, over as long as the dark takes. */}
      <Wash
        kind="ground"
        visible={showing}
        goMs={RECEDE_MS}
        style={[styles.ground, { height: frame.height * 0.5 }]}
      />
      <BreathingSky
        level={level}
        dark={dark}
        full={faded}
        word={early || !receded ? view.word : null}
      >
        {captionLine.text !== null && (
          <Fade
            pointerEvents="none"
            visible={captionLine.visible}
            style={[styles.caption, { top: frame.word - 120 }]}
          >
            <EchoText
              variant="bodyL"
              serif
              align="center"
              accessibilityLiveRegion="polite"
              style={[styles.captionText, { color: ink.text }, ink.shadow]}
            >
              {balanceLines(captionLine.text, lineCapacity(frame.width - 80, 21))}
            </EchoText>
          </Fade>
        )}
        {safetyLine.text !== null && (
          <Fade
            pointerEvents="none"
            visible={safetyLine.visible}
            style={[styles.safety, { top: frame.low + 28 }]}
          >
            <EchoText variant="caption" align="center" style={[styles.safetyText, ink.shadow]}>
              {balanceLines(safetyLine.text, lineCapacity(frame.width - 96, 12.5, false))}
            </EchoText>
          </Fade>
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
          style={({ pressed }) => [styles.end, { opacity: pressed ? 0.6 : 1 }]}
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
    </Animated.View>
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
