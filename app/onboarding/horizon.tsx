import { useRouter } from 'expo-router';

import { ThreeChoiceScreen, type ThreeChoiceOption } from '@/components/ThreeChoiceScreen';
import { setHorizonSelection, type HorizonSelection } from '@/state/onboardingSelections';

const CHOICES: readonly ThreeChoiceOption<HorizonSelection>[] = [
  {
    centerX: 60.3,
    id: 'behind_me',
    label: 'Behind me',
    subtitle: 'A memory or\nsomething unfinished',
  },
  {
    centerX: 196.5,
    id: 'where_i_am',
    label: 'Where I am',
    subtitle: 'What I’m feeling now',
  },
  {
    centerX: 334.9,
    id: 'ahead_of_me',
    label: 'Ahead of me',
    subtitle: 'A choice or\nwhat comes next',
  },
];

export default function HorizonScreen() {
  const router = useRouter();

  return (
    <ThreeChoiceScreen
      choices={CHOICES}
      columnWidth={138}
      ctaLabel="Start here"
      currentStep={2}
      defaultSelection="where_i_am"
      onBack={() => router.back()}
      onContinue={(selection) => {
        setHorizonSelection(selection);
        router.push('/onboarding/voice');
      }}
      screen="horizon"
      subtitle="We’ll shape your first questions around it."
      title={'Which horizon needs\nyour attention?'}
    />
  );
}
