import { copy } from '@/content/copy';
import { PlaceholderStep } from '@/features/onboarding/PlaceholderStep';

export function VoiceScreen() {
  return <PlaceholderStep screen="voice" title={copy.voice.title} cta={copy.voice.cta} />;
}
