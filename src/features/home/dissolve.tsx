import { router, usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { BackHandler } from 'react-native';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/design/useReduceMotion';
import { arriveOffered } from '@/features/become/arrive';
import { useMorning } from '@/features/become/morning';
import { usePreferences } from '@/state/preferences';

/** Everything on Home melts away over this long, and the photograph never moves (D-003). */
export const DISSOLVE_MS = 900;
/** Reduce Motion: the same hand-off, as a plain and brief fade. */
export const REDUCED_FADE_MS = 160;
/** Coming back, Home's UI rises over the still photograph. */
export const RETURN_MS = 800;
const RETURN_DELAY_MS = 120;
/**
 * Home is whole again this long after the phase goes back to idle. Anything that wants to be seen
 * on Home, a stone being set above all, waits for it: nothing lands under a Home that is still
 * fading in.
 */
export const ARRIVAL_AFTER_IDLE_MS = RETURN_DELAY_MS + RETURN_MS;
/** The status bar goes once the UI is mostly gone, so nothing shifts under a visible layout. */
const STATUS_BAR_AT = 0.5;
/** If the session never appears, Home gives itself back rather than staying empty. */
const GIVE_UP_MS = 2000;
const CLOSE_GRACE_MS = 60;
/** A Home that begins veiled is given its interface by this long after it mounts, whatever it waits for. */
export const VEIL_CAP_MS = 1500;

/**
 * idle: Home as usual. leaving: dissolving, taps ignored. gone: only the photograph remains. veiled:
 * Home's first look after onboarding, before its interface has risen: only the photograph, with the
 * status bar left as it was.
 */
export type DissolvePhase = 'idle' | 'leaving' | 'gone' | 'veiled';

type Href = string | { pathname: string; params: Record<string, string> };

/**
 * How Home's interface comes back: after `delay`, over `duration`. The usual return is RETURN_DELAY_MS and
 * RETURN_MS. A page fading out above Home asks for no delay and its own length, so that Home rises as the
 * page goes rather than after it (walk v12: a dim beat with neither, every time).
 */
export type ReturnPace = { delay?: number; duration?: number };

type Dissolve = {
  /** 0 is Home as designed, 1 is only the mountains. */
  progress: SharedValue<number>;
  phase: DissolvePhase;
  /** Fades Home away, then opens the session in the same breath, with no animation. */
  dissolve: (href: Href) => void;
  /** The session opened. */
  sessionOpened: () => void;
  /** The session closed, so Home's UI comes back. */
  sessionClosed: () => void;
  /**
   * Home's UI comes back now, ahead of the session closing. Asked for by the card that follows the
   * session, so that Home is whole beneath it, and arrives with its photograph when the card goes.
   */
  returnHome: (pace?: ReturnPace) => void;
  /** A Home that began veiled is ready to be seen: its interface rises, by the usual return, once. */
  unveil: () => void;
};

const go = (href: Href) => router.push(href as never);

// Without a provider (a test, a story) Home simply navigates.
const still = { get: () => 0, set: () => undefined, value: 0 } as unknown as SharedValue<number>;
const direct: Dissolve = {
  progress: still,
  phase: 'idle',
  dissolve: go,
  sessionOpened: () => undefined,
  sessionClosed: () => undefined,
  returnHome: () => undefined,
  unveil: () => undefined,
};

const DissolveContext = createContext<Dissolve>(direct);

/**
 * Owns the dissolve between Home and the daily session. It lives above the stack, so Home's screen
 * and its tab bar fade from one value, and the session can hand Home back when it closes.
 *
 * `veiled` begins Home with its interface gone and the photograph alone, for Home's first look after
 * onboarding (app/home/_layout.tsx): Completion's interface has gone from over its photograph, Home's
 * photograph comes up over that, and Home's interface then rises by the usual return, when Home says
 * it is ready (`unveil`), and at the latest VEIL_CAP_MS after it mounts. Read once, as Home mounts.
 */
export function HomeDissolveProvider({
  children,
  veiled = false,
}: PropsWithChildren<{ veiled?: boolean }>) {
  const [startsVeiled] = useState(veiled);
  const progress = useSharedValue(startsVeiled ? 1 : 0);
  const [phase, setPhaseState] = useState<DissolvePhase>(startsVeiled ? 'veiled' : 'idle');
  const phaseRef = useRef<DissolvePhase>(startsVeiled ? 'veiled' : 'idle');
  const reduceMotion = useReduceMotion();
  const reducedRef = useRef(reduceMotion);
  useEffect(() => {
    reducedRef.current = reduceMotion;
  }, [reduceMotion]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = useRef(false);
  // Home's UI is coming back, or is back: a return that has begun is never begun again.
  const returning = useRef(false);

  const setPhase = useCallback((next: DissolvePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms));
  }, []);
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(
    () => () => {
      clear();
      if (closing.current) clearTimeout(closing.current);
    },
    [clear],
  );

  const bringBack = useCallback(
    (pace?: ReturnPace) => {
      clear();
      open.current = false;
      returning.current = true;
      setPhase('idle');
      const duration = reducedRef.current ? REDUCED_FADE_MS : (pace?.duration ?? RETURN_MS);
      progress.set(
        withDelay(
          reducedRef.current ? 0 : (pace?.delay ?? RETURN_DELAY_MS),
          withTiming(0, {
            duration,
            easing: Easing.out(Easing.quad),
            reduceMotion: ReduceMotion.Never,
          }),
        ),
      );
    },
    [clear, progress, setPhase],
  );

  const dissolve = useCallback(
    (href: Href) => {
      if (phaseRef.current !== 'idle') return;
      returning.current = false;
      // Home takes touches as soon as it starts to come back, so Begin can be pressed while it is
      // still partly gone. It dissolves what is left of it, not the whole of it again, or it would
      // crawl the last of the way. From a resting Home nothing is gone, and this is the full time.
      const full = reducedRef.current ? REDUCED_FADE_MS : DISSOLVE_MS;
      const duration = Math.max(REDUCED_FADE_MS, Math.round(full * (1 - progress.get())));
      setPhase('leaving');
      progress.set(
        withTiming(1, {
          duration,
          easing: Easing.inOut(Easing.quad),
          reduceMotion: ReduceMotion.Never,
        }),
      );
      later(duration * STATUS_BAR_AT, () => setPhase('gone'));
      later(duration, () => go(href));
      later(duration + GIVE_UP_MS, () => {
        if (!open.current) bringBack();
      });
    },
    [bringBack, later, progress, setPhase],
  );

  const sessionOpened = useCallback(() => {
    open.current = true;
    if (closing.current) clearTimeout(closing.current);
    closing.current = null;
  }, []);
  // A beat of grace, so a remount in development does not read as leaving.
  const sessionClosed = useCallback(() => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = setTimeout(() => {
      closing.current = null;
      // Not again if it was begun already: that would start Home's UI over, from where it had got to.
      if (!returning.current && (phaseRef.current !== 'idle' || progress.get() > 0)) bringBack();
      open.current = false;
    }, CLOSE_GRACE_MS);
  }, [bringBack, progress]);

  const returnHome = useCallback(
    (pace?: ReturnPace) => {
      if (returning.current || (phaseRef.current === 'idle' && progress.get() === 0)) return;
      bringBack(pace);
    },
    [bringBack, progress],
  );

  // Back while Home is melting, before what it melts into has opened: the person has changed their mind.
  // Home comes back and nothing opens. Left to the stack, the press closed ECHO to the launcher (walk v12,
  // a Back 116 ms after Write instead). Once the session or Breathe is open, its own Back answers first.
  useEffect(() => {
    if (phase !== 'leaving' && phase !== 'gone') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open.current) return false;
      bringBack();
      return true;
    });
    return () => subscription.remove();
  }, [bringBack, phase]);

  const unveil = useCallback(() => {
    if (phaseRef.current !== 'veiled') return;
    bringBack();
  }, [bringBack]);
  // Home is never left veiled.
  useEffect(() => {
    if (!startsVeiled) return;
    const cap = setTimeout(unveil, VEIL_CAP_MS);
    return () => clearTimeout(cap);
  }, [startsVeiled, unveil]);

  const value = useMemo(
    () => ({ progress, phase, dissolve, sessionOpened, sessionClosed, returnHome, unveil }),
    [progress, phase, dissolve, sessionOpened, sessionClosed, returnHome, unveil],
  );
  return <DissolveContext.Provider value={value}>{children}</DissolveContext.Provider>;
}

export const useHomeDissolve = () => useContext(DissolveContext);

/** Opacity for everything on Home that is not the photograph. */
export function useHomeVeil() {
  const { progress } = useHomeDissolve();
  return useAnimatedStyle(() => ({ opacity: 1 - progress.get() }));
}

/**
 * What a new session is opened with: its mode, and in the morning the Become question and, while it
 * is still offered, Arrive first. Arrive comes before the spoken session only: someone who writes
 * instead is often somewhere sound would not be welcome, and Arrive breathes and speaks aloud even
 * on silent.
 */
export function sessionParams(
  mode: 'voice' | 'write',
  morning: boolean,
  arrive: boolean,
): Record<string, string> {
  if (!morning) return { mode };
  return arrive ? { mode, prompt: 'become', arrive: '1' } : { mode, prompt: 'become' };
}

/** Home's ways into the daily session, and into Breathe. Each one dissolves Home first. */
export function useSessionEntry() {
  const { dissolve } = useHomeDissolve();
  const morning = useMorning();
  const arrive = usePreferences((state) => arriveOffered(state.practice));
  return useMemo(
    () => ({
      // Begin is the spoken session and Write instead is the written one (D-006). Neither follows what
      // was used last: the route says which, so the same stone always does the same thing.
      begin: () =>
        dissolve({ pathname: '/home/session', params: sessionParams('voice', morning, arrive) }),
      writeInstead: () =>
        dissolve({ pathname: '/home/session', params: sessionParams('write', morning, false) }),
      // A draft holding a recording that has not become words opens spoken, as Begin opens it, which
      // is where "Turn my voice into words" is offered. Any other draft opens as it was last used. A
      // morning draft keeps its question, "Who will you be today?", and its Rehearse, at any hour;
      // Arrive is not asked again.
      continueDraft: (draftId: string, { untranscribed = false, become = false } = {}) =>
        dissolve({
          pathname: '/home/session',
          params: {
            draftId,
            ...(untranscribed ? { mode: 'voice' } : {}),
            ...(become ? { prompt: 'become' } : {}),
          },
        }),
      breathe: () => dissolve('/home/breathe'),
    }),
    [arrive, dissolve, morning],
  );
}

/**
 * True while the screen that calls it is the one on show. A stack keeps screens mounted beneath
 * the one above them, so anything such a screen asks of the system, like hiding the status bar,
 * must lapse when another screen takes over. Reads the route it mounted at.
 */
export function useWhileHere() {
  const pathname = usePathname();
  const [here] = useState(pathname);
  return pathname === here;
}
