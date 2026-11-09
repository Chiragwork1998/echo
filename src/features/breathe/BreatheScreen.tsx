import { router, useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryCTA } from '@/components/PrimaryCTA';
import { useLayout } from '@/design/layout';
import { holdTheme } from '@/design/themeHold';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { useMorning } from '@/features/become/morning';
import { useUiBegun, watchAnimation, type Watch } from '@/features/book/animationEnd';
import { useHomeDissolve } from '@/features/home/dissolve';
import { Wash } from '@/features/journal-session/Wash';
import { deviceClock } from '@/features/journal/localDay';
import { usePlus, useRequirePlus, type PlusState } from '@/services/plus';
import { usePreferences } from '@/state/preferences';
import { qa } from '@/testing/qa';

import { freeAt, freeAtAll, openingLength, paceIsFree } from './access';
import { AfterActions, FeelingCheck } from './AfterPractice';
import { restoreJournalAudio } from './audio';
import { BeforeStart } from './BeforeStart';
import { breatheCopy } from './breatheCopy';
import { BreatheHeader } from './BreatheHeader';
import { FeelingsList } from './FeelingsList';
import { recordPractice, type Feeling } from './feelingStore';
import { PRACTICES } from './library/practices';
import { PracticeView, type PracticeEnd } from './PracticeView';
import { compile, DEFAULT_PACE, oneMoreMinute, type Timeline } from './timeline';
import type { Practice } from './types';

const HOME_PATH = '/home';
const BREATHE_PATH = '/home/breathe';
const SESSION_PATH = '/home/session';
const STAGE_MS = 600;
const FOOTER_ABOVE_SAFE_BOTTOM = 18;

/** Home itself, or one of the screens of its stack. */
const inHomeStack = (path: string) => path === HOME_PATH || path.startsWith(`${HOME_PATH}/`);

type Stage =
  | { kind: 'feelings' }
  | { kind: 'before'; practice: Practice }
  | { kind: 'during'; practice: Practice; timeline: Timeline; checked: boolean; run: number }
  | { kind: 'check'; practice: Practice; timeline: Timeline }
  | { kind: 'after'; practice: Practice; timeline: Timeline; support: boolean };

const byId = (id: string | null | undefined) => PRACTICES.find((practice) => practice.id === id);

/** The visual harness can open a stage directly: ?stage=before&practice=heart, and ?plus=free. */
function qaStart(): { stage: Stage | null; plus: PlusState | null } {
  if (!qa.enabled) return { stage: null, plus: null };
  const params = new URLSearchParams(window.location.search);
  const practice = byId(params.get('practice')) ?? PRACTICES[0];
  const plus: PlusState | null =
    params.get('plus') === 'free' ? { status: 'free', isPlus: false } : null;
  if (!practice) return { stage: null, plus };
  const timeline = compile(practice);
  switch (params.get('stage')) {
    case 'before':
      return { stage: { kind: 'before', practice }, plus };
    case 'during':
      return { stage: { kind: 'during', practice, timeline, checked: false, run: 0 }, plus };
    case 'check':
      return { stage: { kind: 'check', practice, timeline }, plus };
    case 'after':
      return { stage: { kind: 'after', practice, timeline, support: params.has('support') }, plus };
    default:
      return { stage: null, plus };
  }
}

/**
 * Each stage settles in over the plate. Reduce Motion: a plain fade of 180 ms. `leaving` takes it away
 * the same way, over 320 ms (180), where a stage is let go of and not cut: Begin, onto the practice.
 */
function Settle({ children, leaving = false }: { children: ReactNode; leaving?: boolean }) {
  const reduced = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(leaving ? 0 : 1, {
        duration: reduced ? tokens.motion.fast : leaving ? tokens.motion.standard : STAGE_MS,
        easing: leaving ? Easing.inOut(Easing.quad) : Easing.bezier(0.22, 1, 0.36, 1),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [leaving, reduced, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View pointerEvents={leaving ? 'none' : 'auto'} style={[styles.fill, style]}>
      {children}
    </Animated.View>
  );
}

/**
 * Breathe, at /home/breathe, over Home's plate and the Night loop. What are you feeling, before it
 * starts, the practice, how you feel now, and then the way on: into today's echo, one more minute, or
 * done. Home dissolved to make room for it, and comes back when it goes.
 */
export function BreatheScreen() {
  const { sessionOpened, sessionClosed } = useHomeDissolve();
  useEffect(() => {
    sessionOpened();
    return sessionClosed;
  }, [sessionOpened, sessionClosed]);
  // The theme must not change under a practice, as it must not under the writing session: a phone
  // that follows the sun, switching at dusk mid-breath, would swap the plate and its colour in view.
  // The hold follows focus, so it never outlives the screen's turn at the front of the stack.
  useFocusEffect(useCallback(() => holdTheme(), []));

  // On Android the session is presented over this screen, which stays up beneath it with whatever it
  // last drew (src/features/home/sessionRoute.ts): the walk (v11) saw the ways on stand under the session
  // for the whole of it, beneath its own Back and Write. While another screen is on show this one is
  // reached by neither a touch nor TalkBack, and beneath another screen of Home's stack it draws nothing.
  // The paywall is drawn over the whole of that stack, plate and all, and it is left as it is under it, so
  // that nothing is bare while the paywall comes and goes. Read from the path each time, as Home reads it.
  const pathname = usePathname();
  const onShow = pathname === BREATHE_PATH;
  const beneath = !onShow && inHomeStack(pathname);
  // Begin your echo lets this screen go before the session comes, as Begin on Home lets Home go: from the
  // press it takes no touch, and the session is opened once the screen has faded away.
  const [handingOver, setHandingOver] = useState(false);
  const [wasBeneath, setWasBeneath] = useState(beneath);
  if (beneath && !wasBeneath) setWasBeneath(true);
  // The screen on show again after another screen was over it is itself again. Only on show: a paywall
  // the session opens over it is not that, and it stays out of sight beneath both.
  if (onShow && wasBeneath) {
    setWasBeneath(false);
    setHandingOver(false);
  }
  const shown = useSharedValue(beneath ? 0 : 1);
  useEffect(() => {
    // A hand-over fades the screen by its own animation, and it is never brought back over its own fade.
    if (handingOver) return;
    shown.set(beneath ? 0 : 1);
  }, [beneath, handingOver, shown]);
  const screenStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const handOver = useRef<Watch | null>(null);
  const uiBegun = useUiBegun();
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
      handOver.current?.cancel();
    };
  }, []);

  const [start] = useState(qaStart);
  const actualPlus = usePlus();
  const plus = start.plus ?? actualPlus;
  const requirePlus = useRequirePlus();
  const prefs = usePreferences((state) => state.practice);
  const updatePractice = usePreferences((state) => state.updatePractice);
  const morning = useMorning();
  const insets = useSafeAreaInsets();
  const { width, gutter } = useLayout();
  const [stage, setStage] = useState<Stage>(start.stage ?? { kind: 'feelings' });
  const [first] = useState(() => usePreferences.getState().practice.begun === 0);

  const allowed = useCallback(
    (free: boolean) => free || plus.isPlus || requirePlus('breath-library'),
    [plus.isPlus, requirePlus],
  );

  const leave = useCallback(() => {
    router.dismissTo(HOME_PATH as never);
  }, []);

  const choose = (practice: Practice) => {
    if (!allowed(freeAtAll(practice))) return;
    setStage({ kind: 'before', practice });
  };

  const practice = stage.kind === 'feelings' ? null : stage.practice;
  const minutes = practice ? openingLength(practice, prefs.minutes[practice.id], plus.isPlus) : 0;
  const pace = plus.isPlus || paceIsFree(prefs.pace) ? prefs.pace : DEFAULT_PACE;

  // Begin lets the Before screen go (it fades away over the plate) and only then hands over to the
  // practice, which comes up over the bare plate: neither the screen nor the practice is cut.
  const [beginning, setBeginning] = useState(false);
  const beginTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (beginTimer.current) clearTimeout(beginTimer.current);
    },
    [],
  );
  const reduced = useReduceMotion();
  const begin = () => {
    if (!practice || beginning) return;
    updatePractice({ begun: prefs.begun + 1 });
    const timeline = compile(practice, { minutes, pace });
    setBeginning(true);
    beginTimer.current = setTimeout(
      () => {
        setStage({ kind: 'during', practice, timeline, checked: false, run: Date.now() });
        setBeginning(false);
      },
      reduced ? tokens.motion.fast : tokens.motion.standard,
    );
  };

  const ended = (end: PracticeEnd) => {
    if (stage.kind !== 'during') return;
    const { practice: done, timeline, checked } = stage;
    // A practice barely begun goes back to before it, uncounted.
    if (!end.finished && end.rounds < 1) return setStage({ kind: 'before', practice: done });
    if (checked) return setStage({ kind: 'after', practice: done, timeline, support: false });
    setStage({ kind: 'check', practice: done, timeline });
  };

  const answer = (feeling: Feeling | null) => {
    if (stage.kind !== 'check') return;
    const day = deviceClock.localDay(new Date());
    void recordPractice(day, stage.practice.id, { practice: true, feeling: feeling ?? undefined });
    const support = stage.practice.afterUnsettled === 'support' && feeling === 'unsettled';
    setStage({ kind: 'after', practice: stage.practice, timeline: stage.timeline, support });
  };

  // Begin your echo. The screen fades away over the plate, over the time the stages take to go (it is
  // a screen let go of, as Before is let go of for the practice), and the session is opened when that
  // fade has ended on the UI thread, never by a clock: a slow phone begins it late. The session then
  // rises over the bare plate, and this screen, beneath it, draws nothing.
  const echo = () => {
    if (handingOver) return;
    setHandingOver(true);
    // The journal records in the mode it expects, whatever Breathe set.
    const restored = restoreJournalAudio();
    const params: Record<string, string> = { mode: 'voice' };
    if (morning) params.prompt = 'become';
    const duration = reduced ? tokens.motion.fast : tokens.motion.standard;
    const watch = watchAnimation(duration, () => {
      void restored.then(() => {
        if (here.current) router.push({ pathname: SESSION_PATH, params } as never);
      });
    });
    handOver.current?.cancel();
    handOver.current = watch;
    const { ended } = watch;
    const gone = () => {
      'worklet';
      runOnJS(ended)();
    };
    shown.set(
      withTiming(
        0,
        { duration, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never },
        gone,
      ),
    );
    uiBegun(watch.began);
  };

  const back = useCallback(() => {
    if (beginning || handingOver) return;
    switch (stage.kind) {
      case 'feelings':
        return leave();
      case 'before':
        return setStage({ kind: 'feelings' });
      case 'check':
        return setStage({
          kind: 'after',
          practice: stage.practice,
          timeline: stage.timeline,
          support: false,
        });
      case 'after':
        return leave();
      case 'during':
        return; // The practice's own End handles it.
    }
  }, [beginning, handingOver, leave, stage]);

  // Back is this screen's while it is on show. Beneath the session it is the session's: this screen's
  // listener stays registered under the session's, which is asked first (the last one registered is),
  // and if it is asked while another screen is on show it passes Back on. It is registered once for
  // each stretch outside a practice, not again with each change of stage or route, so that nothing puts
  // it back above the listener of a screen that came after it.
  const latest = useRef({ back, onShow });
  useEffect(() => {
    latest.current = { back, onShow };
  });
  const practising = stage.kind === 'during';
  useEffect(() => {
    if (practising) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!latest.current.onShow) return false;
      latest.current.back();
      return true;
    });
    return () => subscription.remove();
  }, [practising]);

  const top = Math.max(insets.top - 5, 8);
  const column = { width, paddingHorizontal: gutter, alignSelf: 'center' as const };

  // The screen itself. It is touched and heard only while it is the one on show and is not handing
  // over; how much of it is drawn is `shown`. Beneath another screen of Home's stack it holds nothing at
  // all, so that no view of it is left in the window under that screen (the walk's dump listed the ways
  // on, clickable, under the session). Where it had got to is kept here, and is drawn again should it be
  // on show once more.
  const away = !onShow || handingOver;
  const wrap = (body: ReactNode) => (
    <Animated.View
      testID="breathe-screen"
      style={[styles.fill, screenStyle]}
      pointerEvents={away ? 'none' : 'auto'}
      accessibilityElementsHidden={away}
      importantForAccessibility={away ? 'no-hide-descendants' : 'auto'}
    >
      {beneath ? null : body}
    </Animated.View>
  );

  const content = stage.kind;
  if (stage.kind === 'during') {
    return wrap(
      <PracticeView
        key={stage.run}
        timeline={stage.timeline}
        pace={pace}
        sound={prefs.sound}
        voice={prefs.voice}
        first={first}
        onEnd={ended}
        eased
      />,
    );
  }

  return wrap(
    <View style={styles.fill}>
      <Settle key={content} leaving={beginning}>
        {(stage.kind === 'feelings' || stage.kind === 'before') && (
          // The scrolling begins below the status bar, as on the tab pages and the onboarding screens,
          // so words scrolled up go out of sight there and never pass under the clock. At rest the
          // header sits where it always has.
          <ScrollView
            testID="breathe-scroll"
            style={[styles.fill, { marginTop: top }]}
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={column}>
              <BreatheHeader onBack={back} />
              {stage.kind === 'feelings' ? (
                <FeelingsList practices={PRACTICES} markPlus={!plus.isPlus} onChoose={choose} />
              ) : (
                <BeforeStart
                  practice={stage.practice}
                  minutes={minutes}
                  pace={pace}
                  sound={prefs.sound}
                  voice={prefs.voice}
                  markPlus={!plus.isPlus}
                  onMinutes={(length) => {
                    if (!allowed(freeAt(stage.practice, length))) return;
                    updatePractice({ minutes: { ...prefs.minutes, [stage.practice.id]: length } });
                  }}
                  onPace={(value) => {
                    if (!allowed(paceIsFree(value))) return;
                    updatePractice({ pace: value });
                  }}
                  onSound={() => updatePractice({ sound: !prefs.sound })}
                  onVoice={() => updatePractice({ voice: !prefs.voice })}
                />
              )}
            </View>
          </ScrollView>
        )}
        {stage.kind === 'before' && (
          <View
            style={[styles.footer, column, { bottom: insets.bottom + FOOTER_ABOVE_SAFE_BOTTOM }]}
          >
            <PrimaryCTA label={breatheCopy.begin} onPress={begin} />
          </View>
        )}
        {stage.kind === 'check' && (
          <>
            <Wash kind="sky" visible style={styles.checkShade} />
            <View style={[styles.fill, column, { paddingTop: top }]}>
              <FeelingCheck onAnswer={answer} />
            </View>
          </>
        )}
        {stage.kind === 'after' && <Wash kind="ground" visible style={styles.afterShade} />}
        {stage.kind === 'after' && (
          <View
            style={[
              styles.fill,
              column,
              { paddingTop: top, paddingBottom: insets.bottom + FOOTER_ABOVE_SAFE_BOTTOM },
            ]}
          >
            <AfterActions
              support={stage.support}
              onCloseSupport={() => setStage({ ...stage, support: false })}
              onEcho={echo}
              onMore={() =>
                setStage({
                  kind: 'during',
                  practice: stage.practice,
                  timeline: oneMoreMinute(stage.timeline),
                  checked: true,
                  run: Date.now(),
                })
              }
              onDone={leave}
            />
          </View>
        )}
      </Settle>
    </View>,
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  footer: { position: 'absolute' },
  checkShade: { top: 0, height: 560 },
  afterShade: { bottom: 0, height: 380 },
});
