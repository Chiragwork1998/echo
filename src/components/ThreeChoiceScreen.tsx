import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppShell } from '@/components/AppShell';
import { ChoiceMarker } from '@/components/ChoiceMarker';
import { EchoBackground } from '@/components/EchoBackground';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { screenBackgrounds, screenFocalPoints, type ImplementedScreenId } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { COLUMN, FRAME, HERO } from '@/design/onboardingLayout';
import { REFERENCE_INSETS } from '@/design/safeArea';
import { tokens } from '@/design/tokens';

export type ThreeChoiceOption<T extends string> = {
  /** Marker centre in 393 pt reference width, measured from the screen edge. */
  centerX: number;
  id: T;
  label: string;
  subtitle: string;
};

type ThreeChoiceScreenProps<T extends string> = {
  choices: readonly ThreeChoiceOption<T>[];
  columnWidth: number;
  ctaLabel: string;
  currentStep: number;
  defaultSelection: T;
  onBack: () => void;
  onContinue: (selection: T) => void;
  screen: Extract<ImplementedScreenId, 'horizon' | 'voice'>;
  showArrow?: boolean;
  subtitle: string;
  title: string;
};

/** Golden offsets are absolute screen points; the stage starts at the safe top. */
const STAGE_OFFSET = REFERENCE_INSETS.top;
const TITLE_TOP = HERO.titleCapTop - HERO.title.capTopOffset - STAGE_OFFSET;
const SUBTITLE_TOP_ONE_LINE = HERO.subtitleCapTop - HERO.subtitle.capTopOffset - STAGE_OFFSET;
const SUBTITLE_TOP_TWO_LINE = HERO.subtitleCapTopTwoLine - HERO.subtitle.capTopOffset - STAGE_OFFSET;
const COLUMN_TOP = COLUMN.markerCenterY - STAGE_OFFSET - COLUMN.markerSize / 2;

export function ThreeChoiceScreen<T extends string>({
  choices,
  columnWidth: referenceColumnWidth,
  ctaLabel,
  currentStep,
  defaultSelection,
  onBack,
  onContinue,
  screen,
  showArrow = false,
  subtitle,
  title,
}: ThreeChoiceScreenProps<T>) {
  const [selection, setSelection] = useState<T>(defaultSelection);
  const { fontScale, width } = useWindowDimensions();
  const { name, theme } = useEchoTheme();

  const accessibleLayout = fontScale >= 1.25;
  const xOffset = (width - FRAME.width) / 2;
  const twoLineTitle = title.includes('\n');
  const subtitleTop = twoLineTitle ? SUBTITLE_TOP_TWO_LINE : SUBTITLE_TOP_ONE_LINE;

  const continueWith = (value: T) => {
    onContinue(value);
  };

  return (
    <AppShell
      theme={theme}
      background={
        <EchoBackground
          fallbackColor={theme.color.textInk}
          focalPoint={screenFocalPoints[screen]}
          source={screenBackgrounds[name][screen]}
        />
      }
    >

      {accessibleLayout ? (
        <ScrollView contentContainerStyle={styles.accessibleContent} showsVerticalScrollIndicator={false}>
          <OnboardingHeader currentStep={currentStep} onBack={onBack} />
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.screenSubtitle}>{subtitle}</Text>
          <View accessibilityRole="radiogroup" style={styles.accessibleChoices}>
            {choices.map((choice) => {
              const selected = selection === choice.id;
              return (
                <Pressable
                  accessibilityLabel={`${choice.label}. ${choice.subtitle.replace('\n', ' ')}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={choice.id}
                  onPress={() => setSelection(choice.id)}
                  style={({ pressed }) => [
                    styles.accessibleChoice,
                    {
                      backgroundColor: theme.color.surfaceGlassStrong,
                      borderColor: selected ? theme.color.focus : theme.color.borderGlass,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <ChoiceMarker selected={selected} variant="column" />
                  <View style={styles.accessibleChoiceCopy}>
                    <Text style={styles.accessibleChoiceLabel}>{choice.label}</Text>
                    <Text style={styles.accessibleChoiceSubtitle}>
                      {choice.subtitle.replace('\n', ' ')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <PrimaryCTA
            label={ctaLabel}
            onPress={() => continueWith(selection)}
            showArrow={showArrow}
            style={styles.accessibleCta}
          />
        </ScrollView>
      ) : (
        <View style={styles.stage}>
          <OnboardingHeader currentStep={currentStep} onBack={onBack} />

          <Text accessibilityRole="header" style={[styles.title, styles.stageTitle, { top: TITLE_TOP }]}>
            {title}
          </Text>
          <Text style={[styles.screenSubtitle, { top: subtitleTop }]}>{subtitle}</Text>

          <View
            accessibilityRole="radiogroup"
            pointerEvents="box-none"
            style={[StyleSheet.absoluteFill, styles.clip]}
          >
            {choices.map((choice) => {
              const selected = selection === choice.id;
              return (
                <Pressable
                  accessibilityLabel={`${choice.label}. ${choice.subtitle.replace('\n', ' ')}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={choice.id}
                  onPress={() => setSelection(choice.id)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      top: COLUMN_TOP,
                      left: choice.centerX + xOffset - referenceColumnWidth / 2,
                      width: referenceColumnWidth,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <ChoiceMarker selected={selected} variant="column" />
                  <View style={styles.connector} />
                  <Text style={styles.choiceLabel}>{choice.label}</Text>
                  <Text style={styles.choiceSubtitle}>{choice.subtitle}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <PrimaryCTA label={ctaLabel} onPress={() => continueWith(selection)} showArrow={showArrow} />
          </View>
        </View>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  /** Clipping the stage keeps edge columns from widening the web layout viewport. */
  stage: { flex: 1, overflow: 'hidden' },
  clip: { overflow: 'hidden' },
  title: {
    color: '#FFF9EF',
    ...tokens.type.display,
    fontSize: HERO.title.size,
    letterSpacing: HERO.title.tracking,
    lineHeight: HERO.title.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(3,11,22,0.40)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  stageTitle: { position: 'absolute', left: 24, right: 24 },
  screenSubtitle: {
    position: 'absolute',
    left: 24,
    right: 24,
    color: 'rgba(255,249,239,0.92)',
    ...tokens.type.ui,
    fontSize: HERO.subtitle.size,
    letterSpacing: tokens.typography.bodyM.tracking,
    lineHeight: HERO.subtitle.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(3,11,22,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  choice: { position: 'absolute', alignItems: 'center' },
  pressed: { opacity: 0.72 },
  connector: {
    width: COLUMN.connector.width,
    height: COLUMN.connector.height,
    marginTop: COLUMN.connector.gap,
    backgroundColor: COLUMN.connector.color,
  },
  choiceLabel: {
    marginTop: COLUMN.label.topOffset,
    color: '#FFF9EF',
    ...tokens.type.display,
    fontSize: COLUMN.label.size,
    lineHeight: COLUMN.label.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(3,11,22,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  choiceSubtitle: {
    marginTop: COLUMN.subtitle.topOffset,
    color: 'rgba(255,249,239,0.92)',
    ...tokens.type.ui,
    fontSize: COLUMN.subtitle.size,
    lineHeight: COLUMN.subtitle.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(3,11,22,0.40)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  footer: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  accessibleContent: { paddingHorizontal: 24, paddingBottom: 28 },
  accessibleChoices: { marginTop: 24, gap: 12 },
  accessibleChoice: {
    minHeight: 72,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  accessibleChoiceCopy: { flex: 1 },
  accessibleChoiceLabel: {
    color: '#FFF9EF',
    ...tokens.type.display,
    fontSize: 22,
    lineHeight: 26,
  },
  accessibleChoiceSubtitle: {
    marginTop: 2,
    color: 'rgba(255,249,239,0.92)',
    ...tokens.type.ui,
    fontSize: 14,
    lineHeight: 19,
  },
  accessibleCta: { alignSelf: 'center', marginTop: 32 },
});
