import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { cue, cuedWithin } from '@/design/haptics';
import { useLatestEntry, useReflection } from '@/features/journal';

import { cardView } from './cardState';
import { CompletionLayout } from './CompletionLayout';
import { savedLine } from './text';

// A reflection that is still coming is named only once it has taken this long. Resolving at once,
// as it does with no provider, then never flashes a loading line.
const WAIT_BEFORE_NAMING = 450;
// A closing that settled this recently has already given the haptic for arriving here.
const SETTLED_RECENTLY_MS = 3000;

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

  // Once, on arrival. A commit: this is the moment the practice is held, not a button press. Not
  // when the closing has just settled, so that the two never buzz one after the other.
  const buzzed = useRef(false);
  useEffect(() => {
    if (buzzed.current) return;
    buzzed.current = true;
    if (!cuedWithin('settle', SETTLED_RECENTLY_MS)) cue('commit');
  }, []);

  const enter = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setEntering(true);
    setFailed(false);
    if (!(await onEnter())) {
      // Only a failure frees the button. After success the screen is about to go.
      busy.current = false;
      setEntering(false);
      setFailed(true);
    }
  }, [onEnter]);

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
    />
  );
}
