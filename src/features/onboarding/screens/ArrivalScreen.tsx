import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { usePlatePoint } from '@/design/usePlatePoint';
import { backPath, nextPath } from '@/features/onboarding/flow';
import { ArrivalHeader } from '@/features/onboarding/arrival/ArrivalHeader';
import { ArrivalHeading } from '@/features/onboarding/arrival/ArrivalHeading';
import { STONES, hitBox } from '@/features/onboarding/arrival/geometry';
import { MoodList } from '@/features/onboarding/arrival/MoodList';
import { MoodStone } from '@/features/onboarding/arrival/MoodStone';
import { StoneRipple } from '@/features/onboarding/arrival/StoneRipple';
import { useOnboarding, type Mood } from '@/state/onboarding';

const STEP = 6;
const LIST_TOP = 28;
// Stored values with their words from the copy deck, in the deck's order.
const MOODS: readonly Mood[] = ['light', 'steady', 'unsettled', 'heavy', 'numb'];
const OPTIONS = MOODS.map((value, index) => ({ value, label: copy.arrival.moods[index] ?? value }));
const labelOf = (value: Mood) => OPTIONS.find((option) => option.value === value)?.label ?? value;

/** The five stones and the water around the chosen one, pinned to the photograph. */
function Stream({ mood, onChoose }: { mood?: Mood; onChoose: (value: Mood) => void }) {
  const toScreen = usePlatePoint();
  const { name } = useTheme();
  const stones = STONES[name].map(({ value, at, rx, ry }) => {
    const { x, y, scale } = toScreen(at.x, at.y);
    return { value, at: { x, y }, rx: rx * scale, ry: ry * scale };
  });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.arrival.subtitle}
    >
      {stones.map(({ value, at, rx, ry }) => (
        <StoneRipple key={value} at={at} rx={rx} ry={ry} active={value === mood} />
      ))}
      {stones.map(({ value, at, rx, ry }) => (
        <MoodStone
          key={value}
          label={labelOf(value)}
          box={hitBox(at, rx, ry)}
          rx={rx}
          ry={ry}
          selected={value === mood}
          onSelect={() => onChoose(value)}
        />
      ))}
    </View>
  );
}

export function ArrivalScreen() {
  const { accessibleLayout, sceneryFits } = useLayout();
  const mood = useOnboarding((state) => state.mood);
  const update = useOnboarding((state) => state.update);

  const choose = useCallback(
    (value: Mood) => {
      if (value === mood) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      update({ mood: value });
    },
    [mood, update],
  );

  const back = backPath('arrival');
  const next = nextPath('arrival');
  const goNext = () => next && router.navigate(next as never);
  const skip = () => {
    update({ mood: undefined });
    goNext();
  };
  // No back arrow on this step, so the system back button must return to Privacy itself, even when
  // Privacy is not beneath this screen in the stack.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!back) return false;
        router.navigate(back as never);
        return true;
      });
      return () => subscription.remove();
    }, [back]),
  );

  // The stream needs the full portrait photograph, and room for the words at normal text size. On a
  // tablet the plate still fills the screen, but the stones would land off the water.
  const list = !sceneryFits;
  const heading = <ArrivalHeading title={copy.arrival.title} subtitle={copy.arrival.subtitle} />;

  return (
    <ScreenShell
      screen="arrival"
      header={<ArrivalHeader step={STEP} onSkip={skip} stacked={accessibleLayout} />}
      footer={
        <PrimaryCTA
          label={copy.arrival.cta}
          disabled={!mood}
          disabledHint={copy.arrival.subtitle}
          onPress={goNext}
        />
      }
      plateOverlay={list ? undefined : <Stream mood={mood} onChoose={choose} />}
    >
      {list ? (
        <>
          {heading}
          <View style={styles.list}>
            <MoodList
              options={OPTIONS}
              selected={mood}
              onSelect={choose}
              accessibilityLabel={copy.arrival.subtitle}
            />
          </View>
        </>
      ) : (
        heading
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: LIST_TOP },
});
