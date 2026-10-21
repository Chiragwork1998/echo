import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/GlassCard';
import { PrimaryCTA } from '@/components/PrimaryCTA';
import { TabScreen } from '@/components/TabScreen';
import { WeekRhythm } from '@/components/WeekRhythm';
import { tokens } from '@/design/tokens';
import { useEchoTheme } from '@/design/ThemeProvider';
import { deriveRhythmWeek, useJournal, useJournalDraft, type JournalEntry } from '@/state/journal';
import { startSession } from '@/state/session';
import { useOnboardingRestore, useOnboardingState } from '@/state/onboardingSelections';

const GREETING = {
  day: { title: 'Good morning.', subtitle: 'There is room for you here.' },
  night: { title: 'Where are you, really?', subtitle: 'One honest answer is enough.' },
} as const;

const SESSION = '/onboarding/first-echo' as Href;

export default function HomeScreen() {
  const router = useRouter();
  const { name, theme } = useEchoTheme();
  const entries = useJournal();
  const draft = useJournalDraft();
  const mode = useOnboardingState((state) => state.mode);

  useOnboardingRestore();

  const days = useMemo(() => deriveRhythmWeek(entries), [entries]);
  const recent = draft ?? entries[0] ?? null;
  const copy = GREETING[name];

  const beginToday = () => {
    startSession(mode === 'let_me_speak' ? 'voice' : 'text');
    router.push(SESSION);
  };

  return (
    <TabScreen tab="today" title={copy.title}>
      <Text style={[styles.subtitle, { color: theme.color.textSecondary }]}>{copy.subtitle}</Text>
      <Text style={[styles.sectionLabel, { color: theme.color.textSecondary }]}>
        Today · 7 min
      </Text>

      <GlassCard style={styles.promptCard} variant="strong">
        <Text style={[styles.prompt, { color: theme.color.textPrimary }]}>
          What is asking for your attention?
        </Text>
      </GlassCard>
      <View style={styles.cta}>
        <PrimaryCTA label="Begin today’s echo" onPress={beginToday} />
      </View>

      <Text style={[styles.sectionLabel, styles.sectionSpacing, { color: theme.color.textSecondary }]}>
        From your path
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/echoes' as Href)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <GlassCard style={styles.recentCard}>
          <Text style={[styles.recentLabel, { color: theme.color.textSecondary }]}>
            Continue an echo
          </Text>
          {recent ? (
            <RecentSummary entry={recent} isDraft={draft !== null} />
          ) : (
            <Text style={[styles.recentTitle, { color: theme.color.textPrimary }]}>
              Your first echo will appear here.
            </Text>
          )}
        </GlassCard>
      </Pressable>

      <Text style={[styles.sectionLabel, styles.sectionSpacing, { color: theme.color.textSecondary }]}>
        This week
      </Text>
      <View style={styles.week}>
        <WeekRhythm days={days} />
      </View>
    </TabScreen>
  );
}

function RecentSummary({ entry, isDraft }: { entry: JournalEntry; isDraft: boolean }) {
  const { theme } = useEchoTheme();
  const when = new Date(entry.updatedAt);
  const label = isDraft
    ? 'Draft · not saved yet'
    : `${when.toLocaleDateString()} · ${Math.max(1, Math.round(entry.durationSeconds / 60))} min`;
  return (
    <>
      <Text style={[styles.recentTitle, { color: theme.color.textPrimary }]}>
        {entry.promptTextSnapshot}
      </Text>
      <Text style={[styles.recentMeta, { color: theme.color.textSecondary }]}>{label}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginTop: tokens.space[8],
    ...tokens.type.ui,
    fontSize: tokens.typography.bodyM.size,
    lineHeight: tokens.typography.bodyM.lineHeight,
  },
  sectionLabel: {
    marginTop: tokens.space[24],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
  sectionSpacing: { marginTop: tokens.space[32] },
  promptCard: { marginTop: tokens.space[12] },
  prompt: {
    ...tokens.type.display,
    fontSize: tokens.typography.displayM.size - 8,
    lineHeight: tokens.typography.displayM.lineHeight - 6,
  },
  cta: { marginTop: tokens.space[16], alignItems: 'center' },
  recentCard: { marginTop: tokens.space[12] },
  recentLabel: {
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
  },
  recentTitle: {
    marginTop: tokens.space[8],
    ...tokens.type.display,
    fontSize: tokens.typography.bodyL.size + 2,
    lineHeight: tokens.typography.bodyL.lineHeight + 5,
  },
  recentMeta: {
    marginTop: tokens.space[4],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size,
    lineHeight: tokens.typography.caption.lineHeight,
  },
  week: { marginTop: tokens.space[12] },
  pressed: { opacity: 0.78 },
});
