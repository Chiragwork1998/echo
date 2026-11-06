import { copy } from '@/content/copy';
import { PlaceholderStep } from '@/features/onboarding/PlaceholderStep';

export function CompletionScreen() {
  return (
    <PlaceholderStep screen="completion" title={copy.completion.title} cta={copy.completion.cta} />
  );
}
