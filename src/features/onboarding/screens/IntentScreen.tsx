import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { OnboardingHeader } from '@/components/OnboardingHeader';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { textStyle } from '@/design/typography';
import { usePlatePoint } from '@/design/usePlatePoint';
import { backPath, nextPath } from '@/features/onboarding/flow';
import { ChoiceList } from '@/features/onboarding/intent/ChoiceList';
import { RIVER_POINTS, fitTitleSize } from '@/features/onboarding/intent/geometry';
import { RiverPoint } from '@/features/onboarding/intent/RiverPoint';
import { RiverTrail } from '@/features/onboarding/intent/RiverTrail';
import { useOnboarding, type Intent } from '@/state/onboarding';

const STEP = 1;
const LIST_TOP = 28;
const TITLE_BASE_SIZE = textStyle('displayM').fontSize ?? 35.2;
const TITLE_LINE = textStyle('displayM').lineHeight ?? 39.6;
// Each stored value with its label from the copy deck, in the deck's order.
const [QUIET, UNDERSTAND, HOLD, DIRECTION] = copy.intent.options;
const LABELS: Record<Intent, string> = {
  quiet: QUIET,
  understand_self: UNDERSTAND,
  hold_moments: HOLD,
  direction: DIRECTION,
};
const OPTIONS = RIVER_POINTS.map(({ value }) => ({ value, label: LABELS[value] }));

/** The four points and the trail, pinned to the river in the photograph. */
function River({ selected, onChoose }: { selected?: Intent; onChoose: (value: Intent) => void }) {
  const toScreen = usePlatePoint();
  const { width } = useWindowDimensions();
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.intent.title}
    >
      <RiverTrail />
      {RIVER_POINTS.map(({ value, at }) => {
        const point = toScreen(at.x, at.y);
        return (
          <RiverPoint
            key={value}
            label={LABELS[value]}
            at={point}
            screenWidth={width}
            selected={value === selected}
            onSelect={() => onChoose(value)}
          />
        );
      })}
    </View>
  );
}

export function IntentScreen() {
  const { accessibleLayout, gutter, width: column } = useLayout();
  const { width, height, fontScale } = useWindowDimensions();
  const intent = useOnboarding((state) => state.intent);
  const update = useOnboarding((state) => state.update);

  const choose = useCallback(
    (value: Intent) => {
      if (value === intent) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      update({ intent: value });
    },
    [intent, update],
  );

  const back = backPath('intent');
  const next = nextPath('intent');
  // The river layout needs the full portrait photograph, and room for labels at normal text size.
  const list = accessibleLayout || width > height;

  const size = accessibleLayout
    ? TITLE_BASE_SIZE
    : fitTitleSize(TITLE_BASE_SIZE, column - gutter * 2, fontScale);
  const title = { fontSize: size, lineHeight: size * (TITLE_LINE / TITLE_BASE_SIZE) };
  const heading: ReactNode = (
    // One line, as in the golden. A narrow phone sets it a few percent smaller rather than leave
    // "here?" alone on a second line. Large text wraps instead, in the scrolling layout.
    <OnboardingHeading
      title={copy.intent.title}
      subtitle={copy.intent.subtitle}
      titleStyle={title}
    />
  );
  const body = list ? (
    <>
      {heading}
      <View style={styles.list}>
        <ChoiceList options={OPTIONS} selected={intent} onSelect={choose} />
      </View>
    </>
  ) : (
    heading
  );

  return (
    <ScreenShell
      screen="intent"
      header={
        <OnboardingHeader
          step={STEP}
          onBack={back ? () => router.navigate(back as never) : undefined}
        />
      }
      footer={
        <PrimaryCTA
          label={copy.intent.cta}
          disabled={!intent}
          disabledHint={copy.intent.subtitle}
          onPress={() => next && router.navigate(next as never)}
        />
      }
      plateOverlay={list ? undefined : <River selected={intent} onChoose={choose} />}
    >
      {body}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: LIST_TOP },
});
