import { copy } from '@/content/copy';
import { PlaceholderStep } from '@/features/onboarding/PlaceholderStep';

export function HorizonScreen() {
  return <PlaceholderStep screen="horizon" title={copy.horizon.title} cta={copy.horizon.cta} />;
}
