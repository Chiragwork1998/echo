import { shouldOfferPlus, usePlusStore } from '@/services/plus/store';

import { gateBypassed, useGate } from './gate';
import { useLaunch } from './launch';
import { useOnboarding } from './onboarding';
import { decideRoute } from './routing';

/**
 * Whether Landing, onboarding's first screen, may be drawn. It is the route a launch opens on, so
 * it is mounted before the root layout has sent anyone anywhere, and a person who has finished
 * onboarding (or who resumes part way through) would see it for a frame on the way to Home. So it is
 * drawn only when the same rule the root layout applies would leave the person on it. That rule
 * needs the persisted onboarding state, which the gate resolves before it lets any route mount: until
 * then nothing is drawn at all.
 */
export function useLandingVisible(): boolean {
  const status = useGate((state) => state.status);
  const completed = useOnboarding((state) => state.completedAt !== undefined);
  const step = useOnboarding((state) => state.step);
  const offerPlus = usePlusStore(shouldOfferPlus);
  const launching = useLaunch((state) => !state.over);
  // The harness and the web preview have no storage and redirect no one.
  if (gateBypassed) return true;
  if (status.kind !== 'ready') return false;
  const decision = decideRoute({
    pathname: '/',
    completed,
    step,
    resume: status.resume,
    initial: launching,
    offerPlus,
  });
  return decision.action === 'stay';
}
