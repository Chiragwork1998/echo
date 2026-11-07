import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { qa } from '@/testing/qa';

/** Mornings run from 4:00 to 11:59, on the phone's own clock. */
export const MORNING = { from: 4, until: 12 } as const;

export function isMorning(date: Date): boolean {
  const hour = date.getHours();
  return hour >= MORNING.from && hour < MORNING.until;
}

/** The next moment morning begins or ends, after `date`. */
export function nextTurn(date: Date): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  const hour = date.getHours();
  if (hour < MORNING.from) next.setHours(MORNING.from);
  else if (hour < MORNING.until) next.setHours(MORNING.until);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(MORNING.from);
  }
  return next;
}

/**
 * The harness shows evening unless asked (?daypart=morning), so Home's golden is compared as drawn.
 * Null outside the harness.
 */
function qaMorning(): boolean | null {
  if (!qa.enabled) return null;
  return new URLSearchParams(window.location.search).get('daypart') === 'morning';
}

/** Whether it is morning now, kept true to the clock as morning begins and ends. */
export function useMorning(): boolean {
  const pinned = qaMorning();
  const [morning, setMorning] = useState(() => pinned ?? isMorning(new Date()));
  useEffect(() => {
    if (pinned !== null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const now = new Date();
      setMorning(isMorning(now));
      if (timer) clearTimeout(timer);
      // A phone that slept through the turn is caught by the check on coming back.
      timer = setTimeout(check, Math.max(1000, nextTurn(now).getTime() - now.getTime()));
    };
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [pinned]);
  return pinned ?? morning;
}
