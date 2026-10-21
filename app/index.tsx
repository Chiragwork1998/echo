import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/AppShell';
import { EchoBackground } from '@/components/EchoBackground';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { screenBackgrounds, screenFocalPoints } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

export default function LandingPreview() {
  const router = useRouter();
  const { name, theme } = useEchoTheme();

  return (
    <AppShell
      theme={theme}
      background={
        <EchoBackground
          fallbackColor={theme.color.textInk}
          focalPoint={screenFocalPoints.landing}
          source={screenBackgrounds[name].landing}
        />
      }
    >
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text accessibilityRole="header" style={[styles.wordmark, { color: theme.color.textPrimary }]}>ECHO</Text>
          <View style={[styles.rule, { backgroundColor: theme.color.textPrimary }]} />
          <Text style={[styles.tagline, { color: theme.color.textSecondary }]}>Meet the hidden parts of you.</Text>
        </View>
        <View style={styles.actions}>
          <PrimaryCTA label="Begin" onPress={() => router.push('/onboarding/intent')} />
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
  /**
   * Golden hero: wordmark cap top 118 pt, hairline rule at 182 pt, italic
   * tagline cap top 200 pt. The wordmark is a 56 pt display cut, not the 28 pt
   * header cut.
   */
  hero: {
    alignItems: 'center',
    marginTop: 47,
  },
  wordmark: {
    ...tokens.type.display,
    fontSize: 56,
    letterSpacing: 7.5,
    lineHeight: 60,
  },
  rule: { width: 21, height: 1.6, marginTop: 16, opacity: 0.78 },
  tagline: {
    marginTop: 12,
    ...tokens.type.displayItalic,
    fontSize: tokens.typography.bodyL.size,
    lineHeight: tokens.typography.bodyL.lineHeight,
  },
  actions: { alignItems: 'center', paddingBottom: 16 },
  caption: {
    marginTop: 18,
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
});
