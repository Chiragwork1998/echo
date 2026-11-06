import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { EchoWordmark } from '@/components/EchoWordmark';
import { GlassCard } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { OnboardingHeading } from '@/components/OnboardingHeading';
import { copy } from '@/content/copy';
import { goldenCopy } from '@/content/goldenCopy';
import { useLayout } from '@/design/layout';
import { iconXml } from '@/design/generated/vectors';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import type { HomeSummary } from '@/features/journal';

import { useSessionEntry } from '../dissolve';
import { dayLabel, entryDisplay, homeLabels, minutesOf } from './homeLabels';
import { LimestoneStone } from './LimestoneStone';
import { CardSkeleton, ErrorNotice, go, openEntry, PlateThumb, useClock, YOU_PATH } from './shared';
import { WeekRhythm } from './WeekRhythm';

// Measured from the Night golden (868 x 1812, normalised to 393 x 852).
const HEADING_TOP = 42;
const AVATAR = 28;
const THUMB = 60;
const CARD_HEIGHT = 84;
const PILL_HEIGHT = 32;
const PLAY = 37;
const HEADER_INSET = 4; // beyond the gutter: the golden's header sits 28 pt in
const WORDMARK_SCALE = 0.84; // Night's wordmark is smaller than Day's in the goldens
const MOON_FILL = '#F1CF8E';
// The plate is bright rock below the river. The goldens quiet it so the week and the cards read.
const FLOOR_STOPS = ['rgba(3,10,22,0)', 'rgba(3,10,22,0.5)', 'rgba(3,10,22,0.74)'] as const;
const FLOOR_FROM = 0.54;

/** The moon from the handoff's icon set, filled as the golden draws it. */
function Moon() {
  const xml = iconXml.moon
    .replaceAll('currentColor', MOON_FILL)
    .replace('stroke-linejoin', `fill="${MOON_FILL}" stroke-linejoin`);
  return <SvgXml xml={xml} width={22} height={22} accessible={false} />;
}

function Header({ inset }: { inset: number }) {
  const { colors } = useTheme();
  const time = useClock();
  return (
    <View style={[styles.header, { paddingHorizontal: inset }]}>
      <View
        style={styles.time}
        accessible
        accessibilityLabel={`${homeLabels.localTime} ${time}`}
        accessibilityRole="text"
      >
        <Moon />
        <EchoText variant="caption" color="textSecondary" style={styles.timeText}>
          {time}
        </EchoText>
      </View>
      <View style={styles.wordmark} pointerEvents="none">
        <EchoWordmark />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.home.tabs[3]}
        onPress={() => go(YOU_PATH)}
        hitSlop={8}
        style={[styles.avatar, { borderColor: colors.textPrimary }]}
      >
        <PlateThumb size={AVATAR - 3} radius={AVATAR / 2} focus={{ x: 0.02, y: 0.2, width: 0.9 }} />
      </Pressable>
    </View>
  );
}

function SpeakInstead() {
  const { speakInstead } = useSessionEntry();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={goldenCopy.nightSpeakInstead}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        speakInstead();
      }}
      hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
      style={({ pressed }) => [styles.pillTouch, pressed && styles.pillPressed]}
    >
      <GlassCard radius={PILL_HEIGHT / 2}>
        <View style={styles.pill}>
          <Icon name="mic" size={16} color="#F7F3EB" />
          <EchoText variant="bodyM" serif style={styles.pillText} maxFontSizeMultiplier={1.3}>
            {goldenCopy.nightSpeakInstead}
          </EchoText>
        </View>
      </GlassCard>
    </Pressable>
  );
}

type CardProps = { summary: HomeSummary; strong: boolean };

/** Continue an echo, or the latest entry when nothing is in progress, so the slot is never empty. */
function EchoCard({ summary, strong }: CardProps) {
  const { colors } = useTheme();
  const { continueDraft } = useSessionEntry();
  const { rhythm, recent } = summary;
  const draft = summary.continueDraft;
  const entry = draft ?? recent;
  if (!entry) return null;
  const display = entryDisplay(entry);
  const meta = draft
    ? goldenCopy.minutesLeft(draft.minutesLeft)
    : `${dayLabel(entry.localDay, rhythm.today)} · ${homeLabels.minutes(minutesOf(entry.durationSeconds))}`;
  const label = (draft ? copy.home.continueEcho : copy.home.recentTitle).toUpperCase();
  const onPress = () => (draft ? continueDraft(draft.id) : openEntry(entry.id));

  return (
    <GlassCard radius={tokens.radius.medium} strength={strong ? 'strong' : 'regular'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${display.title}. ${display.openable ? meta : ''}`}
        accessibilityState={{ disabled: !display.openable }}
        disabled={!display.openable}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={[styles.thumb, { borderColor: colors.textPrimary }]}>
          <PlateThumb size={THUMB - 3} radius={10} focus={{ x: 0, y: 0.2, width: 0.9 }} />
        </View>
        <View style={styles.cardText}>
          <EchoText variant="caption" color="textSecondary" style={styles.cardLabel}>
            {label}
          </EchoText>
          <EchoText variant="bodyL" serif numberOfLines={strong ? 3 : 1} style={styles.cardTitle}>
            {display.title}
          </EchoText>
          <EchoText variant="caption" color="textSecondary" style={styles.cardMeta}>
            {display.openable ? meta : ''}
          </EchoText>
        </View>
        {draft ? (
          <View style={styles.play}>
            <Icon name="play" size={16} color={colors.textInk} />
          </View>
        ) : display.openable ? (
          <Icon name="arrow-right" size={20} color={colors.textSecondary} />
        ) : null}
      </Pressable>
    </GlassCard>
  );
}

/** Fixed to the screen, behind the scrolling content. */
export function NightFloor() {
  return (
    <LinearGradient
      colors={FLOOR_STOPS}
      locations={[0, 0.34, 1]}
      pointerEvents="none"
      style={styles.floor}
    />
  );
}

/** Night: Living Landscape. The stone is the way in. */
export function NightHome({ summary }: { summary: HomeSummary }) {
  const { accessibleLayout } = useLayout();
  const { begin } = useSessionEntry();
  const { status, rhythm, recent } = summary;
  const loading = status === 'loading';
  const hasCard = summary.continueDraft !== null || recent !== null;
  const inset = HEADER_INSET;

  return (
    <>
      <Header inset={inset} />
      <OnboardingHeading
        title={copy.home.nightHeadline}
        subtitle={copy.home.nightSubtitle}
        top={HEADING_TOP}
        titleStyle={styles.headline}
      />
      <View style={styles.spaceAbove} />
      <LimestoneStone
        title={goldenCopy.nightBegin}
        arcCaption={goldenCopy.nightBeginArc}
        accessibilityLabel={`${goldenCopy.nightBegin}. ${goldenCopy.nightBeginArc}`}
        onPress={begin}
      />
      <View style={styles.pillSlot}>
        <SpeakInstead />
      </View>
      <View style={styles.spaceBelow} />
      <View style={{ paddingHorizontal: 4 }}>
        <WeekRhythm rhythm={rhythm} loading={loading} />
      </View>
      <View style={styles.cardSlot}>
        {status === 'error' && <ErrorNotice summary={summary} />}
        {loading && <CardSkeleton height={CARD_HEIGHT} />}
        {!loading && hasCard && <EchoCard summary={summary} strong={accessibleLayout} />}
        {status === 'ready' && !hasCard && (
          <EchoText variant="bodyM" color="textSecondary" align="center" style={styles.empty}>
            {homeLabels.emptyRecent}
          </EchoText>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  floor: { ...StyleSheet.absoluteFill, top: `${FLOOR_FROM * 100}%` },
  header: { height: tokens.size.headerHeight, flexDirection: 'row', alignItems: 'center' },
  time: { flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 1 },
  timeText: { fontSize: 11.5, lineHeight: 15, letterSpacing: 0.3 },
  wordmark: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 6,
    alignItems: 'center',
    transform: [{ scale: WORDMARK_SCALE }],
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1.5,
    overflow: 'hidden',
    marginLeft: 'auto',
    zIndex: 1,
  },
  headline: { fontSize: 36.4 },
  spaceAbove: { flexGrow: 71, flexBasis: 0, minHeight: 14 },
  spaceBelow: { flexGrow: 83, flexBasis: 0, minHeight: 18 },
  pillSlot: { marginTop: 15, alignItems: 'center' },
  pillTouch: { height: PILL_HEIGHT },
  pillPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  pill: {
    height: PILL_HEIGHT - 2,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  pillText: { fontSize: 11.5, lineHeight: 16, letterSpacing: 0.1 },
  cardSlot: { marginTop: 10, gap: 10, minHeight: CARD_HEIGHT, marginHorizontal: -2 },
  card: {
    minHeight: CARD_HEIGHT - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 11,
  },
  cardPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  thumb: { width: THUMB, height: THUMB, borderRadius: 12, borderWidth: 1.5, overflow: 'hidden' },
  cardText: { flex: 1, gap: 2, paddingVertical: 10 },
  cardLabel: { fontSize: 8.5, lineHeight: 12, letterSpacing: 2, opacity: 0.9 },
  cardTitle: { fontSize: 16.5, lineHeight: 22, letterSpacing: 0 },
  cardMeta: { fontSize: 11, lineHeight: 15, letterSpacing: 0.1, opacity: 0.9 },
  play: {
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(236,230,220,0.78)',
    marginRight: 2,
  },
  empty: { opacity: 0.88, paddingVertical: 20 },
});
