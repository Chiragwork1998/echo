import { LandingScreen } from '@/features/onboarding/screens/LandingScreen';
import { useLandingVisible } from '@/state/useLanding';

/** Onboarding's Landing, unless this launch is on its way somewhere else (see useLandingVisible). */
export default function Index() {
  return useLandingVisible() ? <LandingScreen /> : null;
}
