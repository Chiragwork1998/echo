import { copy } from '@/content/copy';
import { VOICE_SCENE, VOICE_VALUES } from '@/features/onboarding/three-choice/scenes';
import { ThreeChoiceScreen } from '@/features/onboarding/three-choice/ThreeChoiceScreen';
import { useOnboarding, type Mode } from '@/state/onboarding';

const STEP = 3;
// The golden sets this title larger than the token, with tighter lines.
const TITLE = { fontSize: 39.4, lineHeight: 36.5, lineEm: 7.6, top: 33.75, gap: 4 };
const OPTIONS = VOICE_VALUES.map((value, i) => ({
  value,
  title: copy.voice.options[i]?.title ?? '',
  detail: copy.voice.options[i]?.detail ?? '',
}));

export function VoiceScreen() {
  const mode = useOnboarding((state) => state.mode);
  const update = useOnboarding((state) => state.update);
  return (
    <ThreeChoiceScreen<Mode>
      screen="voice"
      step={STEP}
      title={copy.voice.title}
      subtitle={copy.voice.subtitle}
      cta={copy.voice.cta}
      titleSize={TITLE}
      arrow
      scene={VOICE_SCENE}
      options={OPTIONS}
      value={mode}
      onChange={(next) => update({ mode: next })}
    />
  );
}
