import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MoodStone } from '@/components/MoodStone';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { SecondaryButton } from '@/components/SecondaryButton';
import { tokens } from '@/design/tokens';
import { haptics } from '@/services/haptics';
import {
  setArrivalMood,
  setCurrentStep,
  useOnboardingRestore,
  useOnboardingState,
  type MoodSelection,
} from '@/state/onboardingSelections';

const MOODS: readonly { id: MoodSelection; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'steady', label: 'Steady' },
  { id: 'unsettled', label: 'Unsettled' },
  { id: 'heavy', label: 'Heavy' },
  { id: 'numb', label: 'Numb' },
];

const NEXT = '/onboarding/first-echo' as Href;

export default function ArrivalScreen() {
  const router = useRouter();
  const storedMood = useOnboardingState((state) => state.mood);
  const [mood, setMood] = useState<MoodSelection | null>(storedMood);

  useOnboardingRestore();

  useEffect(() => {
    setCurrentStep(6);
  }, []);

  const choose = (value: MoodSelection) => {
    setMood(value);
    setArrivalMood(value);
    haptics.light();
  };

  const skip = () => {
    setArrivalMood(null);
    router.push(NEXT);
  };

  return (
    <OnboardingScaffold
      currentStep={6}
      footer={
        <View style={styles.footer}>
          <PrimaryCTA disabled={mood === null} label="That’s close" onPress={() => router.push(NEXT)} />
          <SecondaryButton label="Skip" onPress={skip} style={styles.skip} variant="ghost" />
        </View>
      }
      onBack={() => router.back()}
      screen="arrival"
      subtitle="What has today felt like?"
      title="Arrive as you are."
    >
      <View accessibilityRole="radiogroup" style={styles.stones}>
        {MOODS.map((option) => (
          <MoodStone
            key={option.id}
            label={option.label}
            onPress={() => choose(option.id)}
            selected={mood === option.id}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  stones: { flexDirection: 'row', justifyContent: 'space-between', gap: tokens.space[4] },
  /** `alignSelf: stretch` keeps the stacked primary CTA at its full 345 pt. */
  footer: { alignSelf: 'stretch', alignItems: 'center', gap: tokens.space[4] },
  skip: { alignSelf: 'center', width: 'auto' },
});
