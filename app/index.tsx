import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/AppShell';
import { EchoBackground } from '@/components/EchoBackground';
import { themes } from '@/design/themes';
import { tokens } from '@/design/tokens';

const landingBackground = require('../assets/echo/backgrounds/day/00-landing.png');

export default function LandingPreview() {
  const theme = themes.day;

  return (
    <AppShell
      theme={theme}
      background={<EchoBackground source={landingBackground} fallbackColor={theme.color.textInk} />}
    >
      <LinearGradient
        colors={['rgba(3, 11, 22, 0.42)', 'rgba(3, 11, 22, 0)']}
        locations={[0, 1]}
        pointerEvents="none"
        style={styles.topScrim}
      />
      <LinearGradient
        colors={['rgba(3, 11, 22, 0)', 'rgba(3, 11, 22, 0.54)']}
        locations={[0, 1]}
        pointerEvents="none"
        style={styles.bottomScrim}
      />
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text accessibilityRole="header" style={[styles.wordmark, { color: theme.color.textPrimary }]}>ECHO</Text>
          <View style={[styles.rule, { backgroundColor: theme.color.textPrimary }]} />
          <Text style={[styles.tagline, { color: theme.color.textSecondary }]}>Meet the hidden parts of you.</Text>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={[styles.buttonLabel, { color: theme.color.textInk }]}>BEGIN</Text>
          </Pressable>
          <Text style={[styles.caption, { color: theme.color.textSecondary }]}>SEVEN MINUTES, ONCE A DAY</Text>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  topScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: '42%',
  },
  bottomScrim: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: '34%',
  },
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
    fontFamily: tokens.typography.displayFamilyIOS,
    fontSize: tokens.typography.wordmark.size,
    fontWeight: '400',
    letterSpacing: tokens.typography.wordmark.tracking,
    lineHeight: tokens.typography.wordmark.lineHeight,
  },
  rule: { width: 16, height: 1, marginTop: 18, opacity: 0.8 },
  tagline: {
    marginTop: 16,
    fontFamily: tokens.typography.displayFamilyIOS,
    fontSize: 16,
    fontStyle: 'italic',
  },
  actions: { alignItems: 'center', paddingBottom: 10 },
  button: {
    width: '100%',
    maxWidth: tokens.layout.maxContentWidth,
    height: tokens.size.primaryButtonHeight,
    borderRadius: tokens.radius.button,
    backgroundColor: '#F6F1E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  buttonLabel: {
    fontSize: tokens.typography.button.size,
    fontWeight: '500',
    letterSpacing: tokens.typography.button.tracking,
  },
  caption: {
    marginTop: 14,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
  },
});
