import { usePathname } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { cue } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { useAppForeground } from '@/design/useAppForeground';
import { useReduceMotion } from '@/design/useReduceMotion';
import type { HomeSummary } from '@/features/journal';
import { useOnboarding } from '@/state/onboarding';
import { usePreferences } from '@/state/preferences';

import { ARRIVAL_AFTER_IDLE_MS, REDUCED_FADE_MS, useHomeDissolve } from '../dissolve';
import { homeLabels } from './homeLabels';
import {
  DAY_END_MS,
  END_MARGIN_MS,
  HOLD_MS,
  NIGHT_END_MS,
  PEBBLE_SETTLE_AT_MS,
  REDUCED_MS,
  SETTLE_AT_MS,
  WELCOME_ARRIVAL_AT_MS,
} from './stoneMotion';
import {
  countsOf,
  heldRhythm,
  isWelcome,
  plan,
  useStoneMemory,
  welcomeCandidate,
  type Pending,
  type StoneCounts,
} from './stoneMemory';

/** Home's own place in the route tree: the stone is only set while this is what is on show. */
const HOME_PATH = '/home';

export type StoneKind = Pending['kind'];

/**
 * What Home shows of a stone being set. At rest there is nothing to say. Waiting, Home is as the
 * person last saw it (today's cairn still an outline) while it returns from the session. Playing,
 * the cairn is built before their eyes, from `before` to what is now true.
 */
export type StoneView =
  | { phase: 'rest' }
  | { phase: 'waiting'; kind: StoneKind }
  | {
      phase: 'playing';
      kind: StoneKind;
      before: StoneCounts;
      after: StoneCounts;
      reduced: boolean;
      night: boolean;
      id: number;
    };

const REST: StoneView = { phase: 'rest' };

/**
 * Whether Home's first look might be the welcome: it has not welcomed before and onboarding has only
 * just finished. Known as Home mounts, before the journal answers, which is when the loop has to
 * decide how slowly to wake. Read it once, as a state initialiser; it reads two stores and is not a hook.
 */
export function readWelcomeCandidate(): boolean {
  return welcomeCandidate({
    welcomed: usePreferences.getState().homeWelcomed,
    completedAt: useOnboarding.getState().completedAt,
    now: Date.now(),
  });
}

/**
 * Watches Home's summary for the one change worth marking: today turning from open to done while the
 * app was running (a stone is set), a second echo the same day (the count changes), and, once ever,
 * Home's first look after onboarding (the welcome). It returns the summary to draw, which is Home as
 * it was until the moment to play has come, and what to play.
 *
 * The moment to play: never while Home is dissolved or covered or the app is away; once Home is whole
 * again after a session, and a beat more, so that the person sees the open outline first; and in the
 * welcome, 900 ms after Home's first look, while the river wakes.
 *
 * The one haptic of the arrival, and the line a screen reader is told, are made here, in time with
 * the cairn. A second echo the same day makes neither: the count changing is not a stone.
 */
export function useStoneArrival(summary: HomeSummary): { summary: HomeSummary; stones: StoneView } {
  const { phase: dissolve } = useHomeDissolve();
  const here = usePathname() === HOME_PATH;
  const foreground = useAppForeground();
  const reduced = useReduceMotion();
  const { name } = useTheme();

  const shown = useStoneMemory((memory) => memory.shown);
  const playedDay = useStoneMemory((memory) => memory.playedDay);
  const pendingNow = useStoneMemory((memory) => memory.pending);

  // Whether Home has welcomed before is read once, as Home first appears. It is marked as welcomed
  // at the same moment, whether or not there is a welcome to play.
  const [welcomed] = useState(() => usePreferences.getState().homeWelcomed);
  const [mountedAt] = useState(() => Date.now());
  const markWelcomed = usePreferences((state) => state.setHomeWelcomed);
  useEffect(() => {
    if (!welcomed) markWelcomed(true);
  }, [markWelcomed, welcomed]);

  const live = summary.status === 'ready';
  const counts = useMemo(() => countsOf(summary.rhythm), [summary.rhythm]);
  // The welcome is decided by the first summary there is, and never again.
  const [firstLook, setFirstLook] = useState<boolean | null>(null);
  const welcome =
    firstLook ??
    (live &&
      isWelcome({
        welcomed,
        totalDays: summary.rhythm.totalDays,
        todayDone: counts.todayDone,
        completedAt: useOnboarding.getState().completedAt,
        now: mountedAt,
      }));
  if (firstLook === null && live) setFirstLook(welcome);

  const planned = live
    ? plan({ shown, playedDay, pending: pendingNow }, counts, welcome)
    : { shown, pending: pendingNow };
  useEffect(() => {
    if (live) useStoneMemory.getState().observe(counts, welcome);
  }, [counts, live, welcome]);
  const pending = planned.pending;

  const [playing, setPlaying] = useState<Extract<StoneView, { phase: 'playing' }> | null>(null);
  const turn = useRef(0);
  const dissolveRef = useRef(dissolve);
  useEffect(() => {
    dissolveRef.current = dissolve;
  }, [dissolve]);

  // Waiting to play.
  useEffect(() => {
    if (!pending || playing) return;
    if (dissolve !== 'idle' || !here || !foreground) return;
    const wait =
      pending.kind === 'first'
        ? Math.max(0, WELCOME_ARRIVAL_AT_MS - (Date.now() - mountedAt))
        : (reduced ? REDUCED_FADE_MS : ARRIVAL_AFTER_IDLE_MS) + HOLD_MS;
    const timer = setTimeout(() => {
      turn.current += 1;
      setPlaying({
        phase: 'playing',
        kind: pending.kind,
        before: pending.before,
        after: pending.after,
        reduced,
        night: name === 'night',
        id: turn.current,
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [dissolve, foreground, here, mountedAt, name, pending, playing, reduced]);

  // Playing: the haptic and the announcement in time with the cairn, and the end of it.
  useEffect(() => {
    if (!playing) return;
    const { kind, night, reduced: still } = playing;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (kind !== 'digits') {
      void AccessibilityInfo.announceForAccessibility(homeLabels.cairnBuilt);
      const landsAt = still ? REDUCED_MS / 2 : night ? SETTLE_AT_MS : PEBBLE_SETTLE_AT_MS;
      // A press that has begun the dissolve is no moment for a stone to settle in the hand.
      timers.push(setTimeout(() => dissolveRef.current === 'idle' && cue('settle'), landsAt));
    }
    const endsAt = still ? REDUCED_MS : night ? NIGHT_END_MS : DAY_END_MS;
    timers.push(
      setTimeout(() => {
        useStoneMemory.getState().finish();
        setPlaying(null);
      }, endsAt + END_MARGIN_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [playing]);
  // An arrival whose data moved on under it (a day turned, an echo was deleted) is let go of.
  const arriving = pending ? playing : null;
  const held = useMemo(
    () =>
      pending && !arriving
        ? { ...summary, rhythm: heldRhythm(summary.rhythm, pending.before) }
        : summary,
    [arriving, pending, summary],
  );
  const stones: StoneView = !pending
    ? REST
    : arriving
      ? arriving
      : { phase: 'waiting', kind: pending.kind };
  return { summary: held, stones };
}
