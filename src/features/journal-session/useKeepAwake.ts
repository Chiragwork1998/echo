import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** The one tag the screen is held under, so every way out lets go of exactly this. */
export const TAKE_KEEP_AWAKE_TAG = 'echo-take';

// AppState.currentState is null until the system first answers, so only a clear "away" counts.
const isAway = (state: unknown) => state === 'background' || state === 'inactive';

/**
 * Keeps the screen on while `on`, and lets it go on every way out: `on` turning false, the screen
 * unmounting, and the app leaving the foreground (a phone that has been locked or switched away from
 * has no screen to keep on, and the take has already ended safely, as useVoiceRecorder does it).
 *
 * A person who speaks does not touch the screen. At its timeout the phone would sleep, the app would
 * go to the background, and the take would stop itself: they would speak on to a recorder that is no
 * longer listening. So the session holds the screen from the moment a take starts until its words are
 * on the page or that attempt has failed. Nothing else holds it. A deliberate power-button lock
 * still ends the take safely.
 */
export function useKeepAwakeWhile(on: boolean) {
  const [foreground, setForeground] = useState(!isAway(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) =>
      setForeground(!isAway(next)),
    );
    return () => subscription.remove();
  }, []);

  const held = on && foreground;
  useEffect(() => {
    if (!held) return;
    // Failing to hold the screen is not a reason to stop the take: it is the way it was before.
    void activateKeepAwakeAsync(TAKE_KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(TAKE_KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [held]);
}

/**
 * How long a page may be left untouched before the screen is let go of, as the phone would let it go. A
 * person thinking between sentences is still journaling; a phone left on the table with the page open should
 * still sleep in the end.
 */
export const JOURNAL_IDLE_MS = 5 * 60_000;

/**
 * True while the person is journaling: from the moment the page opens, and again from every word typed and
 * every touch, for JOURNAL_IDLE_MS. `poke` says they are still here.
 */
export function useStillJournaling(idleMs = JOURNAL_IDLE_MS) {
  const [active, setActive] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), idleMs);
  }, [idleMs]);
  const poke = useCallback(() => {
    arm();
    setActive(true);
  }, [arm]);
  useEffect(() => {
    arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [arm]);
  return { active, poke };
}
