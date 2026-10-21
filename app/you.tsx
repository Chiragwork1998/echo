import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { GlassCard } from '@/components/GlassCard';
import { TabScreen } from '@/components/TabScreen';
import { tokens } from '@/design/tokens';
import { useEchoTheme, type EchoThemeSetting } from '@/design/ThemeProvider';
import { useOnboardingRestore, useOnboardingState } from '@/state/onboardingSelections';

const THEME_OPTIONS: readonly { id: EchoThemeSetting; label: string }[] = [
  { id: 'automatic', label: 'Automatic' },
  { id: 'day', label: 'Day' },
  { id: 'night', label: 'Night' },
];

/**
 * Functional route shell: theme, reminder and privacy state that already
 * exists in the app. Export, sign-in and deletion land after the approved You
 * golden screens.
 */
export default function YouScreen() {
  const { setting, setSetting, theme } = useEchoTheme();
  const reminder = useOnboardingState((state) => state.reminder);
  const privacy = useOnboardingState((state) => state.privacy);

  useOnboardingRestore();

  return (
    <TabScreen tab="you" title="You">
      <Text style={[styles.sectionLabel, { color: theme.color.textSecondary }]}>Theme</Text>
      <GlassCard style={styles.card}>
        <View accessibilityRole="radiogroup" style={styles.themeRow}>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              onPress={() => setSetting(option.id)}
              selected={option.id === setting}
              style={styles.chip}
            />
          ))}
        </View>
      </GlassCard>

      <Text style={[styles.sectionLabel, { color: theme.color.textSecondary }]}>Your settings</Text>
      <GlassCard style={styles.card}>
        <SummaryRow label="Gentle reminder" value={reminder.enabled ? reminder.localTime : 'Off'} />
        <SummaryRow label="Journal lock" value={privacy.biometricLockEnabled ? 'On' : 'Off'} />
        <SummaryRow label="Private backup" value={privacy.privateBackupEnabled ? 'On' : 'Off'} />
      </GlassCard>
    </TabScreen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { theme } = useEchoTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: theme.color.textPrimary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.color.textSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: tokens.space[20],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
  card: { marginTop: tokens.space[8] },
  themeRow: { flexDirection: 'row', gap: tokens.space[8] },
  chip: { flex: 1 },
  summaryRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[12],
  },
  summaryLabel: {
    ...tokens.type.ui,
    fontSize: tokens.typography.bodyM.size,
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
  summaryValue: {
    ...tokens.type.uiMedium,
    fontSize: tokens.typography.bodyM.size,
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
});
