import { StyleSheet, Text } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { TabScreen } from '@/components/TabScreen';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import { useJournal } from '@/state/journal';

/**
 * Functional route shell. The visual composition stays unbuilt until the
 * approved Echoes golden screens arrive (`docs/DECISIONS_REQUIRED.md`).
 */
export default function EchoesScreen() {
  const entries = useJournal();
  const { theme } = useEchoTheme();

  return (
    <TabScreen tab="echoes" title="Echoes">
      {entries.length === 0 ? (
        <Text style={[styles.empty, { color: theme.color.textSecondary }]}>
          Your first echo will appear here.
        </Text>
      ) : (
        entries.map((entry) => (
          <GlassCard key={entry.id} style={styles.card}>
            <Text style={[styles.meta, { color: theme.color.textSecondary }]}>
              {`${new Date(entry.createdAt).toLocaleDateString()} · ${Math.max(1, Math.round(entry.durationSeconds / 60))} min · ${entry.mode === 'voice' ? 'Voice' : 'Written'}`}
            </Text>
            <Text style={[styles.prompt, { color: theme.color.textPrimary }]}>
              {entry.promptTextSnapshot}
            </Text>
          </GlassCard>
        ))
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  empty: {
    ...tokens.type.ui,
    fontSize: tokens.typography.bodyM.size,
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
  card: { marginTop: tokens.space[12] },
  meta: {
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
  prompt: {
    marginTop: tokens.space[8],
    ...tokens.type.display,
    fontSize: tokens.typography.bodyL.size,
    lineHeight: tokens.typography.bodyL.lineHeight,
  },
});
