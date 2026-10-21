import { useRouter, type Href } from 'expo-router';

import { ThreeChoiceScreen, type ThreeChoiceOption } from '@/components/ThreeChoiceScreen';
import { setVoiceSelection, type VoiceSelection } from '@/state/onboardingSelections';

const CHOICES: readonly ThreeChoiceOption<VoiceSelection>[] = [
  {
    centerX: 65.5,
    id: 'guide_me',
    label: 'Guide me',
    subtitle: 'One question\nat a time',
  },
  {
    centerX: 195.4,
    id: 'give_me_space',
    label: 'Give me space',
    subtitle: 'A quiet blank page',
  },
  {
    centerX: 326.9,
    id: 'let_me_speak',
    label: 'Let me speak',
    subtitle: 'Voice, without\nediting',
  },
];

export default function VoiceScreen() {
  const router = useRouter();

  return (
    <ThreeChoiceScreen
      choices={CHOICES}
      columnWidth={132}
      ctaLabel="Walk this way"
      currentStep={3}
      defaultSelection="guide_me"
      onBack={() => router.back()}
      onContinue={(selection) => {
        setVoiceSelection(selection);
        router.push('/onboarding/rhythm' as Href);
      }}
      screen="voice"
      showArrow
      subtitle="Choose the kind of space you need."
      title={'How should ECHO\nmeet you?'}
    />
  );
}
