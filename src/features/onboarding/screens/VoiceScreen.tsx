import { copy } from '@/content/copy';
import { VOICE_SCENE, VOICE_VALUES } from '@/features/onboarding/three-choice/scenes';
import { ThreeChoiceScreen } from '@/features/onboarding/three-choice/ThreeChoiceScreen';
import { getMicrophonePermission, requestMicrophonePermission } from '@/services/permissions';
import { useOnboarding, type Mode } from '@/state/onboarding';

const STEP = 3;
// The golden sets this title larger than the token, with tighter lines.
const TITLE = { fontSize: 39.4, lineHeight: 36.5, lineEm: 7.6, top: 33.75, gap: 4 };
const OPTIONS = VOICE_VALUES.map((value, i) => ({
  value,
  title: copy.voice.options[i]?.title ?? '',
  detail: copy.voice.options[i]?.detail ?? '',
}));

/**
 * The microphone is asked for here, on the way out of the step about how ECHO meets you, so that journaling
 * never stops to ask (D-018; the owner, 2026-11-09: "dont want to be interrupted while journalling"). Every
 * session opens in Speak (D-006), whatever is chosen here, so everyone is asked. Only the system's own
 * question comes, with no note of ECHO's before it (D-016). It is asked once: a person who refused is not
 * asked again here, and a session asks them only when they speak.
 */
export async function askForMicrophoneOnce() {
  const now = await getMicrophonePermission();
  if (now.status === 'undetermined' && now.canAskAgain) await requestMicrophonePermission();
}

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
      beforeNext={askForMicrophoneOnce}
    />
  );
}
