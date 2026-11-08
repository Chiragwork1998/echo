import { create } from 'zustand';

/**
 * Whether this launch has decided where it is going. Until it has, nothing on screen may be a
 * route the person is about to be sent away from: an onboarded person must never see onboarding's
 * Landing, not even for a frame, so Landing asks this (see useLanding) and the stack does not
 * animate to the place it is sent (see app/_layout).
 */
export const useLaunch = create<{ over: boolean }>(() => ({ over: false }));

/** The first route decision has been taken, and the route it left standing is the one on screen. */
export function endLaunch(): void {
  if (!useLaunch.getState().over) useLaunch.setState({ over: true });
}

/** The navigator is gone (the gate is being resolved again), so the next one launches afresh. */
export function resetLaunch(): void {
  if (useLaunch.getState().over) useLaunch.setState({ over: false });
}
