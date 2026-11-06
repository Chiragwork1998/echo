import { copy } from '@/content/copy';
import { PlaceholderStep } from '@/features/onboarding/PlaceholderStep';

export function RhythmScreen() {
  return <PlaceholderStep screen="rhythm" title={copy.rhythm.title} cta={copy.rhythm.cta} />;
}
