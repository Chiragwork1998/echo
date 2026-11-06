import { onboardingSteps, pathOf, type ScreenId } from '@/features/onboarding/flow';

import { ONBOARDING_LAST_STEP, type OnboardingState } from './onboarding';

export const HOME_PATH = '/home';
const LANDING_PATH = '/';
const FIRST_ECHO_STEP = onboardingSteps.indexOf('first-echo') + 1;

export function pathForStep(step: number): string {
  const id = onboardingSteps[step - 1];
  return id ? pathOf(id as ScreenId) : LANDING_PATH;
}

/** null for routes that are not part of onboarding. */
export function stepForPath(pathname: string): number | null {
  if (pathname === LANDING_PATH) return 0;
  const index = onboardingSteps.findIndex((id) => pathOf(id as ScreenId) === pathname);
  return index === -1 ? null : index + 1;
}

/**
 * Where to resume. A committed first entry with the step still on First Echo means the app died
 * between the commit and the navigation: the writing is done, so go forward to Completion instead of
 * showing an empty page.
 */
export function resumePath(
  state: Pick<OnboardingState, 'step' | 'completedAt'>,
  hasCommittedEntry: boolean,
): string {
  if (state.completedAt !== undefined) return HOME_PATH;
  if (state.step === FIRST_ECHO_STEP && hasCommittedEntry) return pathForStep(ONBOARDING_LAST_STEP);
  return pathForStep(state.step);
}

const isHome = (pathname: string) => pathname === HOME_PATH || pathname.startsWith(`${HOME_PATH}/`);

export type RouteDecision =
  | { action: 'stay' }
  | { action: 'replace'; path: string }
  /** Completion moved on to Home without the flag being set. Finish rather than bounce back. */
  | { action: 'complete' };

/** The rules the root layout applies on every route change. */
export function decideRoute(input: {
  pathname: string;
  completed: boolean;
  step: number;
  /** Where the gate resolved this launch to resume. */
  resume: string;
  /** No navigation has happened yet this launch. */
  initial: boolean;
}): RouteDecision {
  const { pathname, completed, step, resume, initial } = input;
  if (completed)
    return isHome(pathname) ? { action: 'stay' } : { action: 'replace', path: HOME_PATH };
  if (isHome(pathname)) {
    if (step === ONBOARDING_LAST_STEP) return { action: 'complete' };
    return { action: 'replace', path: resume };
  }
  return initial && pathname !== resume ? { action: 'replace', path: resume } : { action: 'stay' };
}
