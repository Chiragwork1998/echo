import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppShell } from '@/components/AppShell';
import { ChoiceMarker } from '@/components/ChoiceMarker';
import { EchoBackground } from '@/components/EchoBackground';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { screenBackgrounds, screenFocalPoints } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { FRAME, HERO, INTENT_CHOICES, INTENT_TRAIL } from '@/design/onboardingLayout';
import { REFERENCE_INSETS } from '@/design/safeArea';
import { tokens } from '@/design/tokens';
import { setIntentSelection, type IntentSelection } from '@/state/onboardingSelections';

type IntentChoiceId = IntentSelection;

const STAGE_OFFSET = REFERENCE_INSETS.top;
const TITLE_TOP = HERO.titleCapTop - HERO.title.capTopOffset - STAGE_OFFSET;
const SUBTITLE_TOP = HERO.subtitleCapTop - HERO.subtitle.capTopOffset - STAGE_OFFSET;
const ROW_HEIGHT = tokens.size.tapTarget;
const MARKER_SLOT = 26;
const LABEL_GAP = 4.5;

export default function IntentScreen() {
  const router = useRouter();
  const [selection, setSelection] = useState<IntentChoiceId | null>(null);
  const { width } = useWindowDimensions();
  const { fontScale } = useWindowDimensions();
  const { name, theme } = useEchoTheme();

  const accessibleLayout = fontScale >= 1.25;
  const xOffset = (width - FRAME.width) / 2;

  const choose = (id: IntentChoiceId) => {
    setSelection(id);
    setIntentSelection(id);
  };

  return (
    <AppShell
      theme={theme}
      background={
        <EchoBackground
          fallbackColor={theme.color.textInk}
          focalPoint={screenFocalPoints.intent}
          source={screenBackgrounds[name].intent}
        />
      }
    >
      {accessibleLayout ? (
        <ScrollView contentContainerStyle={styles.accessibleContent} showsVerticalScrollIndicator={false}>
          <OnboardingHeader currentStep={1} onBack={() => router.back()} />
          <Text accessibilityRole="header" style={styles.title}>
            What brought you here?
          </Text>
          <Text style={styles.screenSubtitle}>Choose what feels closest today.</Text>
          <View accessibilityRole="radiogroup" style={styles.accessibleChoices}>
            {INTENT_CHOICES.map((choice) => {
              const selected = selection === choice.id;
              return (
                <Pressable
                  accessibilityLabel={choice.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={choice.id}
                  onPress={() => choose(choice.id)}
                  style={({ pressed }) => [
                    styles.accessibleChoice,
                    {
                      backgroundColor: theme.color.surfaceGlassStrong,
                      borderColor: selected ? theme.color.focus : theme.color.borderGlass,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <ChoiceMarker selected={selected} />
                  <Text style={styles.accessibleChoiceLabel}>{choice.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <PrimaryCTA
            disabled={!selection}
            label="Begin with this"
            onPress={() => router.push('/onboarding/horizon' as Href)}
            style={styles.accessibleCta}
          />
        </ScrollView>
      ) : (
        <View style={styles.stage}>
          <OnboardingHeader currentStep={1} onBack={() => router.back()} />

          <Text accessibilityRole="header" style={[styles.title, styles.stageTitle, { top: TITLE_TOP }]}>
            What brought you here?
          </Text>
          <Text style={[styles.screenSubtitle, { top: SUBTITLE_TOP }]}>
            Choose what feels closest today.
          </Text>

          <Svg
            height="100%"
            pointerEvents="none"
            preserveAspectRatio="none"
            style={[StyleSheet.absoluteFill, { left: xOffset }]}
            viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
            width={FRAME.width}
          >
            <Path
              d={INTENT_TRAIL}
              fill="none"
              stroke="rgba(3,11,22,0.20)"
              strokeDasharray="0.1 7"
              strokeLinecap="round"
              strokeWidth={3.2}
            />
            <Path
              d={INTENT_TRAIL}
              fill="none"
              stroke="rgba(255,249,239,0.88)"
              strokeDasharray="0.1 7"
              strokeLinecap="round"
              strokeWidth={2.2}
            />
          </Svg>

          <View
            accessibilityRole="radiogroup"
            pointerEvents="box-none"
            style={[StyleSheet.absoluteFill, styles.clip]}
          >
            {INTENT_CHOICES.map((choice) => {
              const selected = selection === choice.id;
              return (
                <Pressable
                  accessibilityLabel={choice.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={choice.id}
                  onPress={() => choose(choice.id)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      left: choice.center.x + xOffset - MARKER_SLOT / 2,
                      top: choice.center.y - STAGE_OFFSET - ROW_HEIGHT / 2,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <ChoiceMarker selected={selected} />
                  <Text style={styles.choiceLabel}>{choice.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <PrimaryCTA
              disabled={!selection}
              label="Begin with this"
              onPress={() => router.push('/onboarding/horizon' as Href)}
            />
          </View>
        </View>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  /** Clipping the stage keeps the dotted trail from widening the web viewport. */
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
  choice: {
    position: 'absolute',
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.72 },
  choiceLabel: {
    marginLeft: LABEL_GAP,
    color: '#FFF9EF',
    ...tokens.type.display,
    fontSize: 18,
    lineHeight: 22,
    textShadowColor: 'rgba(3,11,22,0.45)',
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
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: tokens.radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  accessibleChoiceLabel: {
    flex: 1,
    color: '#FFF9EF',
    ...tokens.type.display,
    fontSize: 22,
    lineHeight: 26,
  },
  accessibleCta: { alignSelf: 'center', marginTop: 32 },
});
