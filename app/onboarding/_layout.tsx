import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  getOnboardingSelections,
  resolveResumeRoute,
  restoreOnboardingState,
} from '@/state/onboardingSelections';

/**
 * Onboarding gate. Renders children through `Slot` so the root Stack keeps
 * ownership of the transition, and resumes a terminated session at its last
 * step once per app launch.
 */
export default function OnboardingLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const resolved = useRef(false);

  useEffect(() => {
    void restoreOnboardingState().then(() => {
      if (resolved.current) {
        return;
      }
      resolved.current = true;
      const state = getOnboardingSelections();
      if (state.completedAt) {
        return;
      }
      const target = resolveResumeRoute(state);
      if (target && target !== pathname) {
        router.replace(target as Href);
      }
    });
  }, [pathname, router]);

  return <Slot />;
}
