import { copy } from '@/content/copy';
import { PlaceholderStep } from '@/features/onboarding/PlaceholderStep';

export function PrivacyScreen() {
  return <PlaceholderStep screen="privacy" title={copy.privacy.title} cta={copy.privacy.cta} />;
}
