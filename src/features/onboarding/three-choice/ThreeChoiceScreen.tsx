import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { OnboardingHeader } from '@/components/OnboardingHeader';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { ScreenShell } from '@/components/ScreenShell';
import { cue } from '@/design/haptics';
import { useLayout } from '@/design/layout';
import { backPath, nextPath, type ScreenId } from '@/features/onboarding/flow';

import { ChoiceList, type Option } from './ChoiceList';
import { ChoiceScene } from './ChoiceScene';
import type { Scene } from './scenes';

const LIST_TOP = 28;
type Props<V extends string> = {
  screen: ScreenId;
  step: number;
  title: string;
  subtitle: string;
  cta: string;
  /**
   * The golden's title size, which differs on each step, with the width of its longer line in ems so
   * a narrow phone sets it a little smaller rather than wrap it a third time.
   */
  titleSize: {
    fontSize: number;
    lineHeight: number;
    lineEm: number;
    measure?: number;
    /** Space above the title, and below it, where the golden differs from the shared heading. */
    top: number;
    gap: number;
  };
  /** Shows the arrow after the CTA label. */
  arrow?: boolean;
  scene: Scene<V>;
  options: readonly Option<V>[];
  value?: V;
  onChange: (value: V) => void;
};

/**
 * Steps 2 and 3 share one composition: a heading in the sky, three choices pinned to the scenery,
 * and the CTA. Single select, nothing chosen until the person chooses, CTA disabled until then.
 */
export function ThreeChoiceScreen<V extends string>({
  screen,
  step,
  title,
  subtitle,
  cta,
  titleSize,
  arrow,
  scene,
  options,
  value,
  onChange,
}: Props<V>) {
  const { gutter, width: column, sceneryFits } = useLayout();
  const { fontScale } = useWindowDimensions();

  const choose = useCallback(
    (next: V) => {
      if (next === value) return;
      cue('tick');
      onChange(next);
    },
    [value, onChange],
  );

  const { fontSize, lineHeight, lineEm, measure, top, gap } = titleSize;
  const fit = ((column - gutter * 2) * 0.99) / (lineEm * Math.max(1, fontScale));
  const size = Math.min(fontSize, Math.floor(fit * 10) / 10);
  const titleStyle = {
    fontSize: size,
    lineHeight: lineHeight * (size / fontSize),
    alignSelf: 'center' as const,
    maxWidth: measure,
    marginBottom: gap,
  };
  const back = backPath(screen);
  const next = nextPath(screen);
  // The scene needs the full portrait photograph, and room for the text at normal size. On a tablet
  // the plate still fills the screen, but the choices would land off the ridge and the path.
  const list = !sceneryFits;

  return (
    <ScreenShell
      screen={screen}
      header={
        <OnboardingHeader
          step={step}
          onBack={back ? () => router.navigate(back as never) : undefined}
        />
      }
      footer={
        <PrimaryCTA
          label={cta}
          arrow={arrow}
          disabled={!value}
          disabledHint={subtitle}
          onPress={() => next && router.navigate(next as never)}
        />
      }
      plateOverlay={
        list ? undefined : (
          <ChoiceScene
            label={title}
            scene={scene}
            options={options}
            selected={value}
            onSelect={choose}
          />
        )
      }
    >
      <OnboardingHeading
        title={title}
        subtitle={subtitle}
        titleStyle={list ? undefined : titleStyle}
        top={list ? undefined : top}
      />
      {list && (
        <View style={styles.list}>
          <ChoiceList label={title} options={options} selected={value} onSelect={choose} />
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: LIST_TOP },
});
