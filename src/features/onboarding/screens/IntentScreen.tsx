import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { textStyle } from '@/design/typography';
import { usePlatePoint } from '@/design/usePlatePoint';
import { backPath, nextPath } from '@/features/onboarding/flow';
import { ChoiceList } from '@/features/onboarding/intent/ChoiceList';
import { RIVER_POINTS, fitTitleSize } from '@/features/onboarding/intent/geometry';
import { RiverPoint } from '@/features/onboarding/intent/RiverPoint';
import { RiverTrail } from '@/features/onboarding/intent/RiverTrail';
import { SoftScrim } from '@/features/onboarding/intent/SoftScrim';
import { useOnboarding, type Intent } from '@/state/onboarding';

const STEP = 1;
// Measured from the goldens: the title block matches PlaceholderStep, and the subtitle is set
// smaller than the bodyM token.
const TITLE_TOP = 34;
const SUBTITLE = { size: 14.1, lineHeight: 20, top: 5 };
const LIST_TOP = 28;
// On compact phones the plate crop lifts the moon toward the subtitle, so the heading rises with it.
const COMPACT_LIFT = 14;
const TITLE_BASE_SIZE = textStyle('displayM').fontSize ?? 35.2;
const TITLE_LINE = textStyle('displayM').lineHeight ?? 39.6;
// The Day plate puts cloud and sun glare behind the heading, which the golden's sky does not have.
// A feathered patch keeps it legible; Night's sky needs none. Insets reach past the column.
const HEADING_SCRIM = { day: 0.3, night: 0, inset: { x: 28, top: 14, bottom: 20 } };
const HEADING_SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.32)',
  textShadowRadius: 10,
  textShadowOffset: { width: 0, height: 1 },
} as const;

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
  const { accessibleLayout, compact, gutter, width: column } = useLayout();
  const { name } = useTheme();
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

  const scrim = HEADING_SCRIM[name];
  const size = accessibleLayout
    ? TITLE_BASE_SIZE
    : fitTitleSize(TITLE_BASE_SIZE, column - gutter * 2, fontScale);
  const title = { fontSize: size, lineHeight: size * (TITLE_LINE / TITLE_BASE_SIZE) };
  const heading: ReactNode = (
    <View style={[styles.heading, compact && { marginTop: TITLE_TOP - COMPACT_LIFT }]}>
      {scrim > 0 && (
        <View pointerEvents="none" style={styles.headingScrim}>
          <SoftScrim alpha={scrim} />
        </View>
      )}
      <EchoText
        variant="displayM"
        align="center"
        accessibilityRole="header"
        // One line, as in the golden. A narrow phone sets it a few percent smaller rather than leave
        // "here?" alone on a second line. Large text wraps instead, in the scrolling layout.
        style={[HEADING_SHADOW, title]}
      >
        {copy.intent.title}
      </EchoText>
      <EchoText
        variant="bodyM"
        color="textSecondary"
        align="center"
        style={[styles.subtitle, HEADING_SHADOW]}
      >
        {copy.intent.subtitle}
      </EchoText>
    </View>
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
      {list && !accessibleLayout ? <ScrollView>{body}</ScrollView> : body}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: TITLE_TOP },
  headingScrim: {
    position: 'absolute',
    left: -HEADING_SCRIM.inset.x,
    right: -HEADING_SCRIM.inset.x,
    top: -HEADING_SCRIM.inset.top,
    bottom: -HEADING_SCRIM.inset.bottom,
  },
  subtitle: { marginTop: SUBTITLE.top, fontSize: SUBTITLE.size, lineHeight: SUBTITLE.lineHeight },
  list: { marginTop: LIST_TOP },
});
