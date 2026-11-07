import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { OneLineLabel } from '@/components/OneLineLabel';
import { EchoWordmark } from '@/components/EchoWordmark';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { copy } from '@/content/copy';
import { goldenCopy } from '@/content/goldenCopy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { becomeCopy } from '@/features/become/becomeCopy';
import { useMorning } from '@/features/become/morning';
import { breatheCopy } from '@/features/breathe/breatheCopy';
import type { HomeSummary } from '@/features/journal';

import { useSessionEntry } from '../dissolve';
import { dayLabel, entryDisplay, homeLabels, minutesOf } from './homeLabels';
import {
  ArrowGlyph,
  CardSkeleton,
  ECHOES_PATH,
  ErrorNotice,
  go,
  openEntry,
  PlateThumb,
  YOU_PATH,
} from './shared';

// Measured from the Day golden (868 x 1812, normalised to 393 x 852).
const AVATAR = 37;
const HERO_INSET = 18; // extra inset of the hero text beyond the gutter
const CARD_INSET = 12; // extra inset of the cards beyond the gutter
const CTA_HEIGHT = 44;
const STONE = 11;
const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton
// Rhythm pebbles: bronze, copper, silver, then the bright one for the latest day.
const PEBBLES = [
  ['#C7B08A', '#8E7650'],
  ['#D9A878', '#9A6A44'],
  ['#D3D3CE', '#8F9193'],
  ['#FFF8E8', '#EADFC8'],
] as const;

function Header() {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.wordmark} pointerEvents="none">
        <EchoWordmark />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.home.tabs[3]}
        onPress={() => go(YOU_PATH)}
        hitSlop={4}
        style={styles.avatar}
      >
        <GlassCard radius={AVATAR / 2} style={styles.fill}>
          <View style={styles.avatarFace}>
            <Icon name="user" size={20} color={colors.textPrimary} />
          </View>
        </GlassCard>
      </Pressable>
    </View>
  );
}

/** The latest stone is always the bright one. Colours cycle, so a long streak stays calm. */
function Pebbles({ count }: { count: number }) {
  return (
    <View style={styles.pebbles} accessibilityElementsHidden importantForAccessibility="no">
      {Array.from({ length: count }, (_, i) => {
        const last = i === count - 1;
        const [light, dark] = PEBBLES[last ? 3 : i % 3] ?? PEBBLES[0];
        return (
          <LinearGradient
            key={i}
            colors={[light, dark]}
            start={{ x: 0.25, y: 0.15 }}
            end={{ x: 0.85, y: 1 }}
            style={[styles.pebble, last && { boxShadow: tokens.shadow.glow }]}
          />
        );
      })}
    </View>
  );
}

function BeginCta() {
  const { colors } = useTheme();
  const { begin } = useSessionEntry();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.home.begin}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        begin();
      }}
      style={({ pressed }) => [pressed && styles.ctaPressed]}
    >
      <LinearGradient
        colors={CREAM_STOPS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cta}
      >
        <EchoText variant="label" style={styles.ctaLabel} color="textInk" numberOfLines={2}>
          {copy.home.begin}
        </EchoText>
        <ArrowGlyph color={colors.textInk} />
      </LinearGradient>
    </Pressable>
  );
}

/** Breathe first: the same quiet link as Write instead, beside it. */
function BreatheFirst() {
  const { breathe } = useSessionEntry();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={breatheCopy.breatheFirst}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        breathe();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
      style={({ pressed }) => [styles.writeInstead, pressed && styles.ctaPressed]}
      testID="home-breathe-first"
    >
      <OneLineLabel variant="caption" color="textSecondary" style={styles.writeInsteadLabel}>
        {breatheCopy.breatheFirst}
      </OneLineLabel>
    </Pressable>
  );
}

/** Voice is the way in (D-006). Writing is one quiet step away, never a second button. */
function WriteInstead() {
  const { writeInstead } = useSessionEntry();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={goldenCopy.dayWriteInstead}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        writeInstead();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
      style={({ pressed }) => [styles.writeInstead, pressed && styles.ctaPressed]}
    >
      <OneLineLabel variant="caption" color="textSecondary" style={styles.writeInsteadLabel}>
        {goldenCopy.dayWriteInstead}
      </OneLineLabel>
    </Pressable>
  );
}

function TodayCard({ summary, strong }: { summary: HomeSummary; strong: boolean }) {
  const { rhythm } = summary;
  const done = rhythm.week.filter((day) => day.completed).length;
  const showRhythm = done > 0 || rhythm.currentStreak > 0;
  const morning = useMorning();
  return (
    <GlassCard radius={tokens.radius.button} strength={strong ? 'strong' : 'regular'}>
      <View style={styles.today}>
        <EchoText variant="caption" style={styles.eyebrow}>
          {copy.home.eyebrow.toUpperCase()}
        </EchoText>
        <EchoText variant="displayM" align="center" style={styles.prompt}>
          {morning ? becomeCopy.question : copy.home.prompt}
        </EchoText>
        <BeginCta />
        <View style={styles.links}>
          <BreatheFirst />
          <WriteInstead />
        </View>
        {showRhythm && (
          <>
            <Pebbles count={Math.max(done, 1)} />
            <EchoText variant="caption" color="textSecondary" style={styles.rhythm}>
              {goldenCopy.dayRhythm(rhythm.currentStreak).toUpperCase()}
            </EchoText>
          </>
        )}
      </View>
    </GlassCard>
  );
}

function RecentCard({ summary, strong }: { summary: HomeSummary; strong: boolean }) {
  const { colors } = useTheme();
  const { recent, rhythm } = summary;
  if (!recent) {
    return (
      <GlassCard radius={tokens.radius.medium} strength={strong ? 'strong' : 'regular'}>
        <View style={styles.emptyRecent}>
          <EchoText variant="bodyM" color="textSecondary" align="center" style={styles.emptyText}>
            {homeLabels.emptyRecent}
          </EchoText>
        </View>
      </GlassCard>
    );
  }
  const display = entryDisplay(recent);
  const meta = `${dayLabel(recent.localDay, rhythm.today)} · ${homeLabels.minutes(minutesOf(recent.durationSeconds))}`;
  return (
    <GlassCard radius={tokens.radius.medium} strength={strong ? 'strong' : 'regular'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${display.title}. ${display.openable ? meta : ''}`}
        accessibilityState={{ disabled: !display.openable }}
        disabled={!display.openable}
        onPress={() => openEntry(recent.id)}
        style={({ pressed }) => [styles.recent, pressed && styles.recentPressed]}
      >
        <PlateThumb size={72} height={69} radius={12} focus={{ x: 0.0, y: 0.24, width: 1 }} />
        <View style={styles.recentText}>
          <EchoText variant="bodyL" serif numberOfLines={strong ? 3 : 1} style={styles.recentTitle}>
            {display.title}
          </EchoText>
          {display.openable && (
            <EchoText variant="caption" color="textSecondary" style={styles.recentMeta}>
              {meta.toUpperCase()}
            </EchoText>
          )}
          {display.preview !== '' && (
            <EchoText
              variant="bodyM"
              color="textSecondary"
              numberOfLines={strong ? 4 : 2}
              style={styles.preview}
            >
              {display.preview}
            </EchoText>
          )}
        </View>
        {display.openable && <Icon name="arrow-right" size={20} color={colors.textSecondary} />}
      </Pressable>
    </GlassCard>
  );
}

/** Day: Valley Morning. A calm headline in the sky, one card, and the way back to the path. */
export function DayHome({ summary }: { summary: HomeSummary }) {
  const { accessibleLayout } = useLayout();
  const { colors } = useTheme();
  const loading = summary.status === 'loading';

  return (
    <>
      <Header />
      <View style={[styles.hero, { marginLeft: HERO_INSET }]}>
        <EchoText variant="label" color="textInk" style={styles.greeting}>
          {copy.home.dayGreeting}
        </EchoText>
        <EchoText
          variant="displayM"
          color="textInk"
          accessibilityRole="header"
          style={styles.headline}
        >
          {copy.home.dayHeadline}
        </EchoText>
        <EchoText variant="bodyM" color="textInk" style={styles.subtitle}>
          {goldenCopy.dayHomeSubtitle}
        </EchoText>
      </View>

      <View style={styles.space} />

      <View style={{ marginHorizontal: CARD_INSET }}>
        <TodayCard summary={summary} strong={accessibleLayout} />
      </View>

      <View style={[styles.pathHeading, { paddingHorizontal: CARD_INSET + 3 }]}>
        <EchoText
          variant="displayM"
          accessibilityRole="header"
          style={styles.pathTitle}
          maxFontSizeMultiplier={1.4}
        >
          {copy.home.recentTitle}
        </EchoText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={goldenCopy.seeAll}
          onPress={() => go(ECHOES_PATH)}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 8 }}
          style={styles.seeAll}
        >
          <EchoText variant="label" style={styles.seeAllText}>
            {goldenCopy.seeAll}
          </EchoText>
          <ArrowGlyph color={colors.textPrimary} size={13} />
        </Pressable>
      </View>

      <View style={[styles.recentSlot, { marginHorizontal: CARD_INSET }]}>
        {summary.status === 'error' && <ErrorNotice summary={summary} />}
        {loading ? (
          <CardSkeleton height={87} />
        ) : summary.status !== 'error' || summary.recent ? (
          <RecentCard summary={summary} strong={accessibleLayout} />
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // The Day golden sits its header about 10 pt higher than Night's.
  header: { height: tokens.size.headerHeight, justifyContent: 'center', marginTop: -10 },
  wordmark: { position: 'absolute', left: 0, right: 0, top: 6, alignItems: 'center' },
  avatar: { position: 'absolute', right: 0, top: 10, width: AVATAR, height: AVATAR },
  avatarFace: {
    width: AVATAR - 2,
    height: AVATAR - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { marginTop: 24 },
  greeting: {
    fontSize: 10.5,
    lineHeight: 15,
    letterSpacing: 1.6,
    opacity: 0.8,
    fontFamily: 'Inter_400Regular',
  },
  headline: { marginTop: 5, maxWidth: 232, fontSize: 36, lineHeight: 33 },
  subtitle: {
    marginTop: 9,
    maxWidth: 138,
    fontFamily: 'Inter_300Light',
    fontSize: 11,
    lineHeight: 15.5,
    letterSpacing: 0.9,
    opacity: 0.84,
  },
  space: { flexGrow: 1, flexBasis: 0, minHeight: 20 },
  today: { paddingTop: 17, paddingBottom: 12, paddingHorizontal: 24 },
  eyebrow: { textAlign: 'center', fontSize: 10.5, lineHeight: 15, letterSpacing: 3, opacity: 0.92 },
  prompt: { marginTop: 8, fontSize: 25, lineHeight: 25, maxWidth: 210, alignSelf: 'center' },
  cta: {
    marginTop: 7,
    minHeight: CTA_HEIGHT,
    borderRadius: CTA_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 20,
    boxShadow: tokens.shadow.button,
  },
  ctaLabel: {
    fontSize: 11.5,
    lineHeight: 16,
    letterSpacing: 1.7,
    flexShrink: 1,
    textAlign: 'center',
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: 4 },
  writeInstead: { minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  writeInsteadLabel: {
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.6,
    textDecorationLine: 'underline',
  },
  pebbles: { marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: STONE },
  pebble: { width: STONE, height: STONE, borderRadius: STONE / 2 },
  rhythm: {
    marginTop: 3,
    textAlign: 'center',
    fontSize: 8.5,
    lineHeight: 12,
    letterSpacing: 2.2,
    opacity: 0.85,
  },
  pathHeading: {
    marginTop: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pathTitle: { fontSize: 18.5, lineHeight: 24 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seeAllText: { fontSize: 9.5, letterSpacing: 1.4 },
  recentSlot: { gap: 10 },
  recent: {
    minHeight: 81,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  recentPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  recentText: { flex: 1, gap: 2 },
  recentTitle: { fontSize: 16, lineHeight: 21, letterSpacing: 0 },
  recentMeta: { fontSize: 8.5, lineHeight: 12, letterSpacing: 2.2, opacity: 0.9 },
  preview: { fontFamily: 'Inter_300Light', fontSize: 10.5, lineHeight: 14, letterSpacing: 0.5 },
  emptyRecent: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyText: { opacity: 0.9 },
});
