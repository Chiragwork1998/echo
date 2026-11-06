import { create } from 'zustand';

import { onboardingSteps, type ScreenId } from '@/features/onboarding/flow';

/**
 * How the scenic plates move as onboarding goes forward and back (INTERACTIONS_AND_STATES.md,
 * "Navigation and motion"). The native stack dissolves one screen into the next but cannot scale a
 * plate, so each plate scales itself, from where its screen sits in the journey relative to the
 * screen that is current:
 *
 *   current          1.000   at rest
 *   behind the flow  1.025   the plate that has been left, drifting toward the viewer as it fades
 *   ahead of the flow 0.985  the plate that has not arrived yet, or has just been backed out of
 *
 * One rule covers both directions. Going forward, the old plate moves from 1.000 to 1.025 while the
 * new one settles from 0.985 to 1.000. Going back is the same motion played the other way: the plate
 * being left shrinks from 1.000 to 0.985, and the one returning settles from 1.025 to 1.000.
 */
export const PLATE_SCALE = { behind: 1.025, current: 1, ahead: 0.985 } as const;

/** Where a screen's plate sits in the journey: Landing is 0 and the eight steps follow. Null elsewhere. */
export function plateStep(screen: ScreenId): number | null {
  if (screen === 'landing') return 0;
  const index = onboardingSteps.indexOf(screen);
  return index === -1 ? null : index + 1;
}

/** The scale a plate rests at, given where it sits and which step of the journey is current. */
export function plateScale(own: number | null, current: number | null): number {
  if (own === null || current === null || own === current) return PLATE_SCALE.current;
  return current > own ? PLATE_SCALE.behind : PLATE_SCALE.ahead;
}

/** The step of the journey the person is on, or null away from it. Kept current by the root layout. */
export const usePlateFlow = create<{ step: number | null }>(() => ({ step: null }));

export function setPlateFlowStep(step: number | null): void {
  if (usePlateFlow.getState().step !== step) usePlateFlow.setState({ step });
}
