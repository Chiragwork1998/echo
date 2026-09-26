import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppShell } from '@/components/AppShell';
import { EchoBackground } from '@/components/EchoBackground';
import { OnboardingHeader } from '@/components/OnboardingHeader';
import { ReadabilityScrim, type DayScrims } from '@/components/ReadabilityScrim';
import { screenBackgrounds } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

/** Day keeps the existing two scrims; Night is handled inside the component. */
const INTENT_DAY_SCRIMS: DayScrims = {
  top: {
    colors: ['rgba(4,14,28,0.48)', 'rgba(4,14,28,0.08)', 'rgba(4,14,28,0)'],
    locations: [0, 0.42, 0.7],
    height: '62%',
  },
  bottom: {
    colors: ['rgba(3,11,22,0)', 'rgba(3,11,22,0.12)', 'rgba(3,11,22,0.70)'],
    locations: [0, 0.52, 1],
    height: '30%',
  },
};

// Reference geometry from SCREEN_SPECS.md: 393 x 852 pt viewport; the safe-area
// content box is 852 - (59 top + 34 bottom) = 759 pt tall.
const REFERENCE = { width: 393, contentHeight: 759 };

type IntentChoiceId = 'quiet_noise' | 'understand_self' | 'hold_moments' | 'find_direction';

type IntentChoice = {
  id: IntentChoiceId;
  label: string;
  /** Marker centre in reference content-box points (x measured from screen left). */
  center: { x: number; y: number };
};

const CHOICES: IntentChoice[] = [
  { id: 'quiet_noise', label: 'Quiet the noise', center: { x: 68, y: 349 } },
  { id: 'understand_self', label: 'Understand myself', center: { x: 194, y: 419 } },
  { id: 'hold_moments', label: 'Hold onto moments', center: { x: 68, y: 500 } },
  { id: 'find_direction', label: 'Find my direction', center: { x: 236, y: 580 } },
];

// Restrained dotted trail through the four marker centres, same reference points.
const TRAIL_PATH = [
  'M 68 349',
  'C 108 386, 148 372, 194 419',
  'C 238 462, 120 462, 68 500',
  'C 26 535, 190 545, 236 580',
].join(' ');

const MARKER_SLOT = 30;
const CTA_COLORS = ['#FBF8F2', '#EDE6DC'] as const;

export default function IntentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<IntentChoiceId | null>(null);
  const { name, theme } = useEchoTheme();

  return (
    <AppShell
      theme={theme}
      background={
        <EchoBackground source={screenBackgrounds[name].intent} fallbackColor={theme.color.textInk} />
      }
    >
      <ReadabilityScrim day={INTENT_DAY_SCRIMS} style={{ bottom: -insets.bottom, top: -insets.top }} />

      <OnboardingHeader currentStep={1} onBack={() => router.back()} />

      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          What brought you here?
        </Text>
        <Text style={styles.subtitle}>Choose what feels closest today.</Text>
      </View>

      <View accessibilityRole="radiogroup" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Svg
          height="100%"
          pointerEvents="none"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
          viewBox={`0 0 ${REFERENCE.width} ${REFERENCE.contentHeight}`}
          width="100%"
        >
          <Path
            d={TRAIL_PATH}
            fill="none"
            stroke="rgba(3,11,22,0.22)"
            strokeDasharray="0.1 7"
            strokeLinecap="round"
            strokeWidth={3}
          />
          <Path
            d={TRAIL_PATH}
            fill="none"
            stroke="rgba(255,249,239,0.85)"
            strokeDasharray="0.1 7"
            strokeLinecap="round"
            strokeWidth={2}
          />
        </Svg>

        {CHOICES.map((choice) => {
          const selected = selection === choice.id;
          return (
            <Pressable
              accessibilityLabel={choice.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              hitSlop={10}
              key={choice.id}
              onPress={() => setSelection(choice.id)}
              style={({ pressed }) => [
                styles.choice,
                {
                  left: choice.center.x - MARKER_SLOT / 2,
                  top: `${((choice.center.y - tokens.size.tapTarget / 2) / REFERENCE.contentHeight) * 100}%`,
                },
                pressed && styles.choicePressed,
              ]}
            >
              <View style={styles.markerSlot}>
                <View style={selected ? styles.markerSelected : styles.markerIdle}>
                  {selected ? <View style={styles.markerCore} /> : null}
                </View>
              </View>
              <Text style={styles.choiceLabel}>{choice.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !selection }}
          disabled={!selection}
          onPress={() => router.push('/onboarding/horizon' as Href)}
          style={({ pressed }) => [styles.cta, !selection && styles.ctaDisabled, pressed && styles.ctaPressed]}
        >
          <LinearGradient
            colors={CTA_COLORS}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={[styles.ctaLabel, { color: theme.color.textInk }]}>Begin with this</Text>
        </Pressable>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  copy: { marginTop: 20, paddingHorizontal: tokens.layout.gutter, alignItems: 'center' },
  title: {
    color: '#FFF9EF',
    fontFamily: tokens.typography.displayFamily,
    fontSize: tokens.typography.displayM.size,
    letterSpacing: tokens.typography.displayM.tracking,
    lineHeight: tokens.typography.displayM.lineHeight,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(255,249,239,0.92)',
    fontFamily: tokens.typography.displayFamily,
    fontSize: tokens.typography.bodyM.size,
    lineHeight: tokens.typography.bodyM.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(3,11,22,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  choice: { position: 'absolute', height: tokens.size.tapTarget, flexDirection: 'row', alignItems: 'center' },
  choicePressed: { opacity: 0.72 },
  markerSlot: { width: MARKER_SLOT, height: MARKER_SLOT, alignItems: 'center', justifyContent: 'center' },
  markerIdle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,249,239,0.92)',
    shadowColor: '#03111F',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  markerSelected: {
    width: MARKER_SLOT,
    height: MARKER_SLOT,
    borderRadius: MARKER_SLOT / 2,
    borderWidth: 2,
    borderColor: '#E7B65B',
    backgroundColor: 'rgba(231,182,91,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E7B65B',
    shadowOpacity: 0.85,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  markerCore: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFDF7' },
  choiceLabel: {
    marginLeft: 10,
    color: '#FFF9EF',
    fontFamily: tokens.typography.displayFamily,
    fontSize: tokens.typography.bodyM.size,
    lineHeight: tokens.typography.bodyM.lineHeight,
    textShadowColor: 'rgba(3,11,22,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  footer: {
    position: 'absolute',
    right: tokens.layout.gutter,
    bottom: 24,
    left: tokens.layout.gutter,
    alignItems: 'center',
  },
  cta: {
    width: '100%',
    maxWidth: tokens.layout.maxContentWidth,
    height: tokens.size.primaryButtonHeight,
    borderRadius: tokens.size.primaryButtonHeight / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  ctaDisabled: { opacity: 0.42, shadowOpacity: 0, elevation: 0 },
  ctaPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  ctaLabel: {
    fontFamily: tokens.typography.uiFamilyMedium,
    fontSize: tokens.typography.button.size,
    letterSpacing: tokens.typography.button.tracking,
    lineHeight: tokens.typography.button.lineHeight,
  },
});
