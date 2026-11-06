import { copy } from '@/content/copy';
import { PlaceholderStep } from '@/features/onboarding/PlaceholderStep';

export function ArrivalScreen() {
  return <PlaceholderStep screen="arrival" title={copy.arrival.title} cta={copy.arrival.cta} />;
}
