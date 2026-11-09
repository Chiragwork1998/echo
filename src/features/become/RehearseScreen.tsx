import { router } from 'expo-router';
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

import { EchoBackground } from '@/components/EchoBackground';
import { EchoText } from '@/components/EchoText';
import { OneLineLabel } from '@/components/OneLineLabel';
import { EASE } from '@/design/ease';
import { PLATE_HELD_OPACITY } from '@/design/platePaint';
import { holdTheme } from '@/design/themeHold';
import { tokens } from '@/design/tokens';
import { usePlateFrame, usePlatePoint } from '@/design/usePlatePoint';
import { useReduceMotion } from '@/design/useReduceMotion';
import { BreathingSky } from '@/features/breathe/BreathingSky';
import { announce } from '@/features/breathe/cues';
import { compile, type Timeline } from '@/features/breathe/timeline';
import { usePracticeRun } from '@/features/breathe/usePracticeRun';
import { CONTROLS, SKY, useSkyInk } from '@/features/journal-session/sky';
import { useScreenReader } from '@/features/journal-session/useScreenReader';
import { Wash } from '@/features/journal-session/Wash';
import { usePreferences } from '@/state/preferences';
import { qa } from '@/testing/qa';

import { becomeCopy } from './becomeCopy';
import { balanceLines, lineCapacity, phraseMs, phrasesOf } from './phrases';
import { COMPLETE_PATH, heldRehearsal, releaseRehearsal } from './rehearsal';

/** The session's book fades under this copy of the plate as the screen arrives, then it lifts. */
const COVER_HOLD_MS = 700;
const COVER_LIFT_MS = 600;
const BEFORE_WORDS_MS = 1200;
const IN_MS = 700;
const OUT_MS = 500;
const GAP_MS = 250;
const FEEL_SECONDS = 30;
const GO_MS = 3800;
/** A tap shows Skip for this long. */
const SKIP_FOR_MS = 4000;
const SERIF = 'CormorantGaramond_500Medium';
const SIDE = 36;
/** The words sit in the middle of the sky. */
const WORDS_AT = (SKY.top + SKY.bottom) / 2 + 40;

type Stage = 'words' | 'feel' | 'go';

/** Made-up words for the harness, which has no session to hand any over. */
const QA_WORDS =
  'I will be calm with my team today. When the meeting gets tense, I will listen first and answer slowly. I will leave work by six.';

/** Rehearse's breath: the sky breathes at Heart's pace, quietly, with no bells. */
function feelTimeline(): Timeline {
  const timeline = compile({
    id: 'rehearse',
    feeling: '',
    name: '',
    line: '',
    why: '',
    source: '',
    minutes: FEEL_SECONDS / 60,
    free: true,
    steps: [{ kind: 'breath', pattern: { kind: 'heart' }, seconds: FEEL_SECONDS }],
  });
  return { ...timeline, cues: [] };
}

/** One line on the sky, settling in and out. Reduce Motion: it only fades. */
function Line({ text, leaving, size }: { text: string; leaving: boolean; size: number }) {
  const reduced = useReduceMotion();
  const { width } = usePlateFrame();
  const lines = balanceLines(text, lineCapacity(width - SIDE * 2, size));
  const ink = useSkyInk();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(leaving ? 0 : 1, {
        duration: leaving ? OUT_MS : IN_MS,
        easing: leaving ? Easing.in(Easing.quad) : EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [leaving, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: reduced ? 0 : (1 - shown.get()) * 8 }],
  }));
  return (
    <Animated.View style={style} testID="rehearse-line">
      <EchoText
        variant="displayM"
        align="center"
        maxFontSizeMultiplier={1.5}
        style={[
          styles.line,
          { fontSize: size, lineHeight: size * 1.28, color: ink.text },
          ink.shadow,
        ]}
      >
        {lines}
      </EchoText>
    </Animated.View>
  );
}

/** The harness: ?rehearse=words|feel|go holds a stage, with ?phrase=n for the words. */
function qaStage(): { stage: Stage; phrase: number } | null {
  if (!qa.enabled) return null;
  const params = new URLSearchParams(window.location.search);
  const stage = params.get('rehearse');
  if (stage !== 'words' && stage !== 'feel' && stage !== 'go') return null;
  return { stage, phrase: Number(params.get('phrase') ?? 0) || 0 };
}

/**
 * Rehearse, after Reflect on a morning entry and before Completion. The person's own words come back
 * over the sky a phrase at a time. Then "Now feel it, as if it is already true." stays while the sky
 * breathes for thirty seconds, then "Go and live it.", and Completion carries on. A tap shows Skip.
 * The words were handed over in memory, and are let go of here.
 */
export function RehearseScreen() {
  const insets = useSafeAreaInsets();
  const plate = usePlatePoint();
  const ink = useSkyInk();
  const screenReader = useScreenReader();
  const reduced = useReduceMotion();
  // The book under this screen holds the theme until it is let go of, on blur; this holds it from
  // the moment this opens, so the hold never lapses between the two.
  useEffect(() => holdTheme(), []);
  const [pinned] = useState(qaStage);
  const [phrases] = useState(() => phrasesOf(heldRehearsal() ?? (pinned ? QA_WORDS : '')));
  const [stage, setStage] = useState<Stage>(
    pinned?.stage ?? (phrases.length > 0 ? 'words' : 'feel'),
  );
  const [phrase, setPhrase] = useState(pinned?.phrase ?? -1);
  const [leaving, setLeaving] = useState(false);
  // The feel line goes as every other line does: it fades out, and the next waits for it.
  const [feelLeaving, setFeelLeaving] = useState(false);
  const [skipShown, setSkipShown] = useState(false);
  const finished = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback(
    (ms: number, run: () => void) => {
      if (pinned) return;
      timers.current.push(setTimeout(run, ms));
    },
    [pinned],
  );
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    releaseRehearsal();
    router.replace(COMPLETE_PATH as never);
  }, []);

  // Rehearse comes in by a fade of its own, over the session's book as it sinks. The stack's fade was not seen
  // on the walked emulator: Rehearse appeared within a frame or two, and its copy of the plate cut the book away
  // before its sink was drawn (walk v11, three morning closings of three). It starts at a hair above nothing, so
  // that it is drawn, and its photograph put on the GPU, from its first frame (see PLATE_HELD_OPACITY).
  const arrival = useSharedValue(pinned ? 1 : PLATE_HELD_OPACITY);
  const arriveMs = reduced || screenReader ? tokens.motion.fast : tokens.motion.standard;
  useEffect(() => {
    arrival.set(
      withTiming(1, {
        duration: arriveMs,
        easing: Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [arrival, arriveMs]);
  const arriving = useAnimatedStyle(() => ({ opacity: arrival.get() }));

  // The plate copy that covers the session as this screen fades in, lifted once it has arrived.
  const cover = useSharedValue(1);
  useEffect(() => {
    const timer = setTimeout(
      () => cover.set(withTiming(0, { duration: COVER_LIFT_MS, reduceMotion: ReduceMotion.Never })),
      pinned ? 0 : COVER_HOLD_MS,
    );
    return () => clearTimeout(timer);
  }, [cover, pinned]);
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.get() }));

  // The words, one phrase at a time.
  useEffect(() => {
    if (stage !== 'words' || pinned) return;
    let at = BEFORE_WORDS_MS;
    phrases.forEach((text, index) => {
      later(at, () => {
        setLeaving(false);
        setPhrase(index);
        if (screenReader) announce(text);
      });
      at += IN_MS + phraseMs(text);
      later(at, () => setLeaving(true));
      at += OUT_MS + GAP_MS;
    });
    later(at, () => setStage('feel'));
  }, [later, phrases, pinned, screenReader, stage]);

  const sound = usePreferences((state) => state.practice.sound);
  const [timeline] = useState(feelTimeline);
  const run = usePracticeRun({
    timeline,
    pace: usePreferences.getState().practice.pace,
    sound,
    voice: false,
    screenReader: false,
    onDone: () => {
      setFeelLeaving(true);
      later(OUT_MS + GAP_MS, () => setStage('go'));
    },
  });
  const { start, level } = run;
  useEffect(() => {
    if (stage !== 'feel') return;
    if (screenReader) announce(becomeCopy.feel);
    if (!pinned) start();
  }, [pinned, screenReader, stage, start]);

  useEffect(() => {
    if (stage !== 'go') return;
    if (screenReader) announce(becomeCopy.go);
    later(GO_MS, finish);
  }, [finish, later, screenReader, stage]);

  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = () => {
    setSkipShown(true);
    if (skipTimer.current) clearTimeout(skipTimer.current);
    skipTimer.current = setTimeout(() => setSkipShown(false), SKIP_FOR_MS);
  };
  useEffect(
    () => () => {
      if (skipTimer.current) clearTimeout(skipTimer.current);
    },
    [],
  );
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => subscription.remove();
  }, [finish]);

  const skip = skipShown || screenReader;
  // Skip comes up when the screen is touched, and goes quietly when it is not. It is out of reach and
  // unannounced the moment it is hidden, whatever its opacity is still doing.
  const skipFade = useSharedValue(0);
  useEffect(() => {
    skipFade.set(
      withTiming(skip ? 1 : 0, {
        duration: reduced ? tokens.motion.fast : skip ? 450 : 350,
        easing: skip ? EASE : Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [reduced, skip, skipFade]);
  const skipStyle = useAnimatedStyle(() => ({ opacity: skipFade.get() }));
  const top = plate(0, WORDS_AT).y;
  const current =
    stage === 'words' ? phrases[phrase] : stage === 'feel' ? becomeCopy.feel : becomeCopy.go;

  return (
    <Animated.View testID="rehearse-arrival" style={[styles.root, arriving]}>
      <StatusBar hidden animated />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, coverStyle]}>
        <EchoBackground screen="home" />
      </Animated.View>
      <Pressable
        accessible={false}
        onPress={touch}
        style={StyleSheet.absoluteFill}
        testID="rehearse-sky"
      />
      <BreathingSky level={level} word={null} tide={false} />
      <Wash kind="sky" visible style={styles.wash} />
      <View pointerEvents="none" style={[styles.words, { top: top - 70 }]}>
        {current !== undefined && (
          <Line
            key={`${stage}-${phrase}`}
            text={current}
            leaving={(stage === 'words' && leaving) || (stage === 'feel' && feelLeaving)}
            size={stage === 'words' ? 28 : 26}
          />
        )}
      </View>
      <Animated.View
        pointerEvents={skip ? 'box-none' : 'none'}
        accessibilityElementsHidden={!skip}
        importantForAccessibility={skip ? 'auto' : 'no-hide-descendants'}
        style={[styles.bottom, { bottom: insets.bottom + CONTROLS.aboveEdge }, skipStyle]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={becomeCopy.skip}
          onPress={finish}
          hitSlop={8}
          style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}
          testID="rehearse-skip"
        >
          <OneLineLabel
            variant="bodyL"
            serif
            style={[styles.skipText, { color: ink.quiet }, ink.shadow]}
          >
            {becomeCopy.skip}
          </OneLineLabel>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wash: { top: 0, height: 420 },
  words: {
    position: 'absolute',
    left: SIDE,
    right: SIDE,
    minHeight: 140,
    justifyContent: 'center',
  },
  line: { fontFamily: SERIF, letterSpacing: 0.2 },
  bottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  skip: {
    minHeight: CONTROLS.height,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { fontFamily: SERIF, fontSize: 20, lineHeight: 25, letterSpacing: 0.7 },
});
