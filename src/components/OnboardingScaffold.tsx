import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from './AppShell';
import { EchoBackground } from './EchoBackground';
import { OnboardingHeader } from './OnboardingHeader';
import { screenBackgrounds, screenFocalPoints, type ImplementedScreenId } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { HERO } from '@/design/onboardingLayout';
import { tokens } from '@/design/tokens';

type OnboardingScaffoldProps = {
  children: ReactNode;
  currentStep: number;
  /** Pinned above the safe-area inset; stays above the keyboard. */
  footer?: ReactNode;
  onBack?: () => void;
  screen: Exclude<ImplementedScreenId, 'landing' | 'home'>;
  subtitle?: string;
  title: string;
};

/**
 * Shared composition for onboarding steps 4–8: full-bleed plate with the
 * manifest focal point, readability scrim, progress header, centered hero copy
 * and a footer that keeps its place with the keyboard open.
 */
export function OnboardingScaffold({
  children,
  currentStep,
  footer,
  onBack,
  screen,
  subtitle,
  title,
}: OnboardingScaffoldProps) {
  const { name, theme } = useEchoTheme();

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OnboardingHeader
            currentStep={currentStep}
            onBack={onBack ?? (() => {})}
            showBack={onBack !== undefined}
          />
          <View style={styles.hero}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.color.textPrimary }]}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.color.textSecondary }]}>{subtitle}</Text>
            ) : null}
          </View>
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: tokens.layout.gutter,
    paddingBottom: tokens.space[16],
  },
  /** Header bottom (44 pt) + 33 pt keeps the title cap top at the golden 144 pt. */
  hero: { marginTop: 33 },
  title: {
    ...tokens.type.display,
    fontSize: HERO.title.size,
    letterSpacing: HERO.title.tracking,
    lineHeight: HERO.title.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(3,11,22,0.40)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  subtitle: {
    marginTop: tokens.space[4],
    ...tokens.type.ui,
    fontSize: HERO.subtitle.size,
    letterSpacing: tokens.typography.bodyM.tracking,
    lineHeight: HERO.subtitle.lineHeight,
    textAlign: 'center',
    textShadowColor: 'rgba(3,11,22,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  body: { marginTop: tokens.space[24] },
  footer: { marginTop: 'auto', paddingTop: tokens.space[16], alignItems: 'center' },
});
