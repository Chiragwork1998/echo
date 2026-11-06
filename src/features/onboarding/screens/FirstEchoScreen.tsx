import { copy } from '@/content/copy';
import { PlaceholderStep } from '@/features/onboarding/PlaceholderStep';

export function FirstEchoScreen() {
  return (
    <PlaceholderStep screen="first-echo" title={copy.firstEcho.title} cta={copy.firstEcho.cta} />
  );
}
