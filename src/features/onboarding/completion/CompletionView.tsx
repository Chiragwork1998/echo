import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { Easing, ReduceMotion, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

import { cue, cuedWithin } from '@/design/haptics';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { useUiBegun, watchAnimation, type Watch } from '@/features/book/animationEnd';
import { useLatestEntry, useReflection } from '@/features/journal';
import { SupportSheet } from '@/features/you/SupportSheet';
import { queueFormat } from '@/services/formatQueue';
import { READING_CONSENT_VERSION, usePreferences } from '@/state/preferences';

import { cardView } from './cardState';
import { CompletionLayout } from './CompletionLayout';
import { ReadingConsentSheet } from './ReadingConsentSheet';
import { savedLine } from './text';

// A reflection that is still coming is named only once it has taken this long. Resolving at once,
// as it does with no provider, then never flashes a loading line.
const WAIT_BEFORE_NAMING = 450;
// A closing that settled this recently has already given the haptic for arriving here. Under Reduce
// Motion the book is not shut and it is a commit that was given, as the screen was left.
const SETTLED_RECENTLY_MS = 3000;
const COMMITTED_RECENTLY_MS = 1500;

/** True once `active` has held for `ms`. */
function useWaited(active: boolean, ms: number) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setDone(true), ms);
    return () => {
      clearTimeout(timer);
      setDone(false);
    };
  }, [active, ms]);
  return active && done;
}

type Props = {
  mode: 'onboarding' | 'daily';
  /**
   * Leaves the screen. Resolves false if it could not, so the screen can say so and stay. Onboarding
   * does not navigate: the root layout moves to Home once completion is durable.
   */
  onEnter: () => Promise<boolean> | boolean;
};

/** What Completion shows, read from the journal. The entry is already saved when this mounts. */
export function CompletionView({ mode, onEnter }: Props) {
  const latest = useLatestEntry();
  const entry = latest.data;
  const reflection = useReflection(entry?.id ?? null);
  const [entering, setEntering] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  // The reading agreement, asked only when the person opens it from the saved card, and the support
  // sheet, opened from the card in place of a reflection. Neither stands between them and Enter your
  // space: today's echo arrives when it arrives.
  const [asking, setAsking] = useState(false);
  const [supporting, setSupporting] = useState(false);
  const { retry } = reflection;
  const agree = useCallback(() => {
    usePreferences.getState().setPatternsConsent(READING_CONSENT_VERSION);
    setAsking(false);
    // Today's echo is asked for at once. What was written is set out now that the agreement covers
    // it, in the background; a spoken entry was handed over as it was kept, under the voice agreement.
    retry();
    if (entry && entry.mode === 'text') queueFormat(entry);
  }, [entry, retry]);

  // Once, on arrival. A commit: this is the moment the practice is held, not a button press. Not
  // when the closing has just settled, so that the two never buzz one after the other. A cold start
  // straight onto this screen has had no closing, and does buzz.
  const buzzed = useRef(false);
  useEffect(() => {
    if (buzzed.current) return;
    buzzed.current = true;
    if (cuedWithin('settle', SETTLED_RECENTLY_MS) || cuedWithin('commit', COMMITTED_RECENTLY_MS)) {
      return;
    }
    cue('commit');
  }, []);

  // Onboarding lets its interface go first. Enter your space fades the words, the card and the button
  // away over the photograph, which stays, and onboarding is completed only once that fade has ended on
  // the UI thread, never by a clock. The root layout then moves to Home, and what is seen between this
  // screen going and Home drawing is the plate backing, which is this same photograph: nothing on the
  // screen changes until Home's photograph comes up over it. The walk (v11) saw that moment as this
  // photograph with nothing on it, cut in after the whole screen. The daily screen leaves another way.
  const lettingGo = mode === 'onboarding';
  const gone = useSharedValue(0);
  const reduced = useReduceMotion();
  const uiBegun = useUiBegun();
  const fade = useRef<Watch | null>(null);
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
      fade.current?.cancel();
    };
  }, []);
  /** Takes the interface to `to` (1 is gone), and resolves when the fade has really ended. */
  const fadeTo = useCallback(
    (to: number) =>
      new Promise<void>((resolve) => {
        const duration = reduced ? tokens.motion.fast : tokens.motion.standard;
        fade.current?.cancel();
        const watch = watchAnimation(duration, resolve);
        fade.current = watch;
        const { ended } = watch;
        const faded = () => {
          'worklet';
          runOnJS(ended)();
        };
        gone.set(
          withTiming(
            to,
            { duration, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never },
            faded,
          ),
        );
        uiBegun(watch.began);
      }),
    [gone, reduced, uiBegun],
  );

  const enter = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setEntering(true);
    setFailed(false);
    if (lettingGo) {
      await fadeTo(1);
      // Left while it faded: nothing is completed from a screen that has gone.
      if (!here.current) return;
    }
    if (!(await onEnter())) {
      // Only a failure frees the button. After success the screen is about to go.
      busy.current = false;
      setEntering(false);
      setFailed(true);
      // The interface comes back to say so, with the button free again.
      if (lettingGo && here.current) void fadeTo(0);
    }
  }, [fadeTo, lettingGo, onEnter]);

  // The entry is already saved, so the system back button must not undo anything. Onboarding stays
  // put, and the daily screen takes the person home as its button does.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode === 'daily') void enter();
        return true;
      });
      return () => subscription.remove();
    }, [enter, mode]),
  );

  const waited = useWaited(reflection.outcome.status === 'pending', WAIT_BEFORE_NAMING);
  const view = cardView({
    entry: { status: latest.status, found: Boolean(entry) },
    outcome: reflection.outcome,
    waited,
  });

  return (
    <>
      <CompletionLayout
        mode={mode}
        view={view}
        saved={savedLine(entry?.durationSeconds)}
        savedVisible={latest.status !== 'loading'}
        entering={entering}
        failed={failed}
        onEnter={() => void enter()}
        onRetry={() => {
          reflection.retry();
          if (latest.status === 'error') void latest.refresh();
        }}
        onAsk={() => setAsking(true)}
        onSupport={() => setSupporting(true)}
        // An entry with no words, such as a recording that never became words, has none to read back.
        entryId={entry?.preview ? entry.id : null}
        leaving={lettingGo ? gone : undefined}
      />
      <ReadingConsentSheet visible={asking} onAgree={agree} onClose={() => setAsking(false)} />
      <SupportSheet visible={supporting} onClose={() => setSupporting(false)} />
    </>
  );
}
