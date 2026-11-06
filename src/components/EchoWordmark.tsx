import { StyleSheet, View } from 'react-native';

import { copy } from '@/content/copy';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { TrackedText } from './TrackedText';

const { size, tracking, lineHeight } = tokens.typography.wordmark;
const HEADER_SCALE = 0.93;
const HERO_SCALE = 1.9; // measured from the Landing golden
const HERO_TRACKING = 13;

/** Letterspaced text with its hairline rule. hero is the large title on Landing. */
export function EchoWordmark({ hero = false, ink = false }: { hero?: boolean; ink?: boolean }) {
  const { colors } = useTheme();
  const scale = hero ? HERO_SCALE : HEADER_SCALE;
  const letterSpacing = hero ? HERO_TRACKING : tracking * scale;
  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="header"
      accessibilityLabel={copy.landing.wordmark}
    >
      <TrackedText
        text={copy.landing.wordmark}
        tracking={letterSpacing}
        variant="wordmark"
        color={ink ? 'textInk' : 'textPrimary'}
        style={{ fontSize: size * scale, lineHeight: lineHeight * scale }}
      />
      <View
        style={[
          styles.rule,
          { width: 16 * (hero ? 1.25 : 1), marginTop: hero ? 15 : 12 },
          { backgroundColor: ink ? colors.textInk : colors.textPrimary },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  rule: { height: 1, opacity: 0.85 },
});
