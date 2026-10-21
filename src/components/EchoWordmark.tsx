import { StyleSheet, Text, View } from 'react-native';

import { HEADER } from '@/design/onboardingLayout';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

const RULE_MARGIN_TOP =
  HEADER.height + HEADER.rule.offsetY - HEADER.wordmark.nudgeY - HEADER.wordmark.lineHeight;

/**
 * ECHO is always letterspaced type, never a logo image. 28 pt with 12 pt
 * tracking from `design/tokens.json` § typography.wordmark.
 */
export function EchoWordmark({ align = 'center' }: { align?: 'center' | 'start' }) {
  const { theme } = useEchoTheme();

  return (
    <View
      accessibilityLabel="ECHO"
      accessibilityRole="header"
      style={[styles.wrap, align === 'center' ? styles.centered : styles.start]}
    >
      <Text style={[styles.wordmark, { color: theme.color.textPrimary }]}>ECHO</Text>
      <View style={[styles.rule, { backgroundColor: theme.color.textPrimary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', alignSelf: 'center' },
  centered: { alignItems: 'center' },
  start: { alignItems: 'flex-start', alignSelf: 'flex-start' },
  wordmark: {
    ...tokens.type.display,
    fontSize: HEADER.wordmark.size,
    letterSpacing: HEADER.wordmark.tracking,
    lineHeight: HEADER.wordmark.lineHeight,
  },
  rule: {
    width: HEADER.rule.width,
    height: HEADER.rule.height,
    marginTop: RULE_MARGIN_TOP,
    opacity: HEADER.rule.opacity,
  },
});
