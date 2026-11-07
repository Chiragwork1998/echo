import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryCTA } from '@/components/PrimaryCTA';
import { useLayout } from '@/design/layout';
import { useMorning } from '@/features/become/morning';
import { useHomeDissolve } from '@/features/home/dissolve';
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
const SESSION_PATH = '/home/session';
const STAGE_MS = 600;
const FOOTER_ABOVE_SAFE_BOTTOM = 18;

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

/** Each stage settles in over the plate. Reduce Motion: a plain fade, which this already is. */
function Settle({ children }: { children: ReactNode }) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(1, {
        duration: STAGE_MS,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
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

  const begin = () => {
    if (!practice) return;
    updatePractice({ begun: prefs.begun + 1 });
    const timeline = compile(practice, { minutes, pace });
    setStage({ kind: 'during', practice, timeline, checked: false, run: Date.now() });
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

  const echo = async () => {
    // The journal records in the mode it expects, whatever Breathe set.
    await restoreJournalAudio();
    const params: Record<string, string> = { mode: 'voice' };
    if (morning) params.prompt = 'become';
    router.push({ pathname: SESSION_PATH, params } as never);
  };

  const back = useCallback(() => {
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
  }, [leave, stage]);

  useEffect(() => {
    if (stage.kind === 'during') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => subscription.remove();
  }, [back, stage.kind]);

  const top = Math.max(insets.top - 5, 8);
  const column = { width, paddingHorizontal: gutter, alignSelf: 'center' as const };

  const content = useMemo(() => stage.kind, [stage.kind]);
  if (stage.kind === 'during') {
    return (
      <PracticeView
        key={stage.run}
        timeline={stage.timeline}
        pace={pace}
        sound={prefs.sound}
        voice={prefs.voice}
        first={first}
        onEnd={ended}
      />
    );
  }

  return (
    <View style={styles.fill}>
      <Settle key={content}>
        {(stage.kind === 'feelings' || stage.kind === 'before') && (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[
              styles.scroll,
              { paddingTop: top, paddingBottom: insets.bottom + 120 },
            ]}
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
          <View style={[styles.fill, column, { paddingTop: top }]}>
            <FeelingCheck onAnswer={answer} />
          </View>
        )}
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
              onEcho={() => void echo()}
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  footer: { position: 'absolute' },
});
