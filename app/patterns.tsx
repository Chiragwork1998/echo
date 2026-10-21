import { StyleSheet, Text } from 'react-native';

import { TabScreen } from '@/components/TabScreen';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import { useJournal } from '@/state/journal';

const PATTERN_THRESHOLD = 5;

/**
 * Functional route shell. Patterns stay opt-in summaries and are never
 * diagnosis; the visual composition waits for approved golden screens.
 */
export default function PatternsScreen() {
  const entries = useJournal();
  const { theme } = useEchoTheme();
  const saved = entries.length;

  return (
    <TabScreen tab="patterns" title="Patterns">
      <Text style={[styles.body, { color: theme.color.textSecondary }]}>
        Patterns become visible after 5 reflections.
      </Text>
      <Text style={[styles.count, { color: theme.color.textPrimary }]}>
        {`${Math.min(saved, PATTERN_THRESHOLD)} of ${PATTERN_THRESHOLD} reflections saved`}
      </Text>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    ...tokens.type.ui,
    fontSize: tokens.typography.bodyM.size,
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
  count: {
    marginTop: tokens.space[12],
    ...tokens.type.display,
    fontSize: tokens.typography.bodyL.size + 2,
    lineHeight: tokens.typography.bodyL.lineHeight + 5,
  },
});
