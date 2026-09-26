import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/AppShell';
import { EchoBackground } from '@/components/EchoBackground';
import { ReadabilityScrim, type DayScrims } from '@/components/ReadabilityScrim';
import { screenBackgrounds } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

/** Day keeps the existing two scrims; Night is handled inside the component. */
const LANDING_DAY_SCRIMS: DayScrims = {
  top: {
    colors: ['rgba(3, 11, 22, 0.42)', 'rgba(3, 11, 22, 0)'],
    locations: [0, 1],
    height: '42%',
  },
  bottom: {
    colors: ['rgba(3, 11, 22, 0)', 'rgba(3, 11, 22, 0.54)'],
    locations: [0, 1],
    height: '34%',
  },
};

export default function LandingPreview() {
  const router = useRouter();
  const { name, theme } = useEchoTheme();

  return (
    <AppShell
      theme={theme}
      background={
        <EchoBackground source={screenBackgrounds[name].landing} fallbackColor={theme.color.textInk} />
      }
    >
      <ReadabilityScrim day={LANDING_DAY_SCRIMS} />
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text accessibilityRole="header" style={[styles.wordmark, { color: theme.color.textPrimary }]}>ECHO</Text>
          <View style={[styles.rule, { backgroundColor: theme.color.textPrimary }]} />
          <Text style={[styles.tagline, { color: theme.color.textSecondary }]}>Meet the hidden parts of you.</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/onboarding/intent')}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.color.surfacePrimary },
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.buttonLabel, { color: theme.color.textInk }]}>BEGIN</Text>
          </Pressable>
          <Text style={[styles.caption, { color: theme.color.textSecondary }]}>SEVEN MINUTES, ONCE A DAY</Text>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: tokens.layout.gutter,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    marginTop: '24%',
  },
  wordmark: {
    fontFamily: tokens.typography.displayFamily,
    fontSize: tokens.typography.wordmark.size,
    letterSpacing: tokens.typography.wordmark.tracking,
    lineHeight: tokens.typography.wordmark.lineHeight,
  },
  rule: { width: 16, height: 1, marginTop: 18, opacity: 0.8 },
  tagline: {
    marginTop: 16,
    fontFamily: tokens.typography.displayFamily,
    fontSize: tokens.typography.bodyM.size,
    fontStyle: 'italic',
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
  actions: { alignItems: 'center', paddingBottom: 10 },
  button: {
    width: '100%',
    maxWidth: tokens.layout.maxContentWidth,
    height: tokens.size.primaryButtonHeight,
    borderRadius: tokens.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  buttonLabel: {
    fontFamily: tokens.typography.uiFamilyMedium,
    fontSize: tokens.typography.button.size,
    letterSpacing: tokens.typography.button.tracking,
    lineHeight: tokens.typography.button.lineHeight,
  },
  caption: {
    marginTop: 14,
    fontFamily: tokens.typography.uiFamily,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
});
