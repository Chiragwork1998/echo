import { copy } from '@/content/copy';
import { PlaceholderStep } from '@/features/onboarding/PlaceholderStep';

export function IntentScreen() {
  return <PlaceholderStep screen="intent" title={copy.intent.title} cta={copy.intent.cta} />;
}
