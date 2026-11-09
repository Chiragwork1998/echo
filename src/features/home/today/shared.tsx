import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { backgroundSources } from '@/design/generated/backgrounds';
import { usePlateThumb } from '@/design/plateThumbs';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import type { HomeSummary } from '@/features/journal';
import { Bars, Resolve } from '@/features/tab-pages/Resolve';

import { homeLabels } from './homeLabels';

export const SESSION_PATH = '/home/session';
export const ECHOES_PATH = '/home/echoes';
export const YOU_PATH = '/home/you';

// Routes owned by other agents or not yet generated into expo-router's types. The session is not
// here: its entrances dissolve Home first, so they live in ../dissolve (useSessionEntry). Each is
// reached from Home, at the foot of its stack, and pushed over it once (see goToTab): Home's stack never
// grows past a tab and an entry.
export const go = (href: string | { pathname: string; params: Record<string, string> }) =>
  router.push(href as never);
export const openEntry = (entryId: string) =>
  router.push({ pathname: ECHOES_PATH, params: { entryId } } as never);

/** The device's wall-clock time, refreshed each half minute. Never leaves the phone. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * A crop of the Home plate, so a thumbnail always looks like where the person is.
 *
 * It is drawn from the plate decoded ahead of time at a size of its own (src/design/plateThumbs.ts), so
 * that it is whole in the first frame it is asked for: at the welcome, and each time the screen comes
 * back after a tab change. It was the plate's own file, decoded when the screen mounted, which takes a
 * frame or more, and was empty for that frame and then popped in (the walk, v10). Only a screen that
 * mounts before the picture is ready, the first launch after the app is opened, meets the plate's own
 * file, and then it dissolves in over the glass rather than appearing; the decoded picture takes over
 * from it without a second dissolve.
 */
export function PlateThumb({
  size,
  height = size,
  focus = { x: 0, y: 0.2, width: 0.9 },
  radius,
}: {
  size: number;
  height?: number;
  /** The part of the plate to show, as fractions of its width and height. */
  focus?: { x: number; y: number; width: number };
  radius: number;
}) {
  const { name } = useTheme();
  const decoded = usePlateThumb(name);
  const imageWidth = size / focus.width;
  const imageHeight = imageWidth * (2796 / 1290);
  return (
    <View
      style={{ width: size, height, borderRadius: radius, overflow: 'hidden' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={decoded ?? backgroundSources[name].home}
        contentFit="fill"
        transition={decoded ? 0 : { duration: tokens.motion.fast, effect: 'cross-dissolve' }}
        style={{
          position: 'absolute',
          width: imageWidth,
          height: imageHeight,
          left: -focus.x * imageWidth,
          top: -focus.y * imageHeight,
        }}
      />
    </View>
  );
}

const ARROW_PATH = 'M4 12h16M14 6l6 6-6 6';

/** The long arrow the Day golden uses on its CTA and on See all. */
export function ArrowGlyph({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Path
        d={ARROW_PATH}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Quiet placeholder while the first read finishes. Same footprint as the card it stands in for. It
 * is said to a screen reader at once and drawn only if the read takes longer than a quarter of a
 * second, so a quick answer never flashes it.
 */
export function CardSkeleton({ height }: { height: number }) {
  return (
    <View accessible accessibilityLabel={homeLabels.loading} accessibilityState={{ busy: true }}>
      <Bars>
        <GlassCard radius={tokens.radius.medium}>
          <View style={[styles.skeleton, { height }]}>
            <View style={[styles.bar, { width: '38%' }]} />
            <View style={[styles.bar, { width: '70%', height: 12 }]} />
          </View>
        </GlassCard>
      </Bars>
    </View>
  );
}

/**
 * Where Home's card goes, while the journal is first read and after. A card that arrives has its glass
 * drawn whole at once and its words faded in on it (glass may not fade: see components/arrival), so its
 * first frame is empty glass: Home's first look after onboarding showed that, then the card (the walk,
 * v11, both welcomes). A skeleton that was drawn is no help, as its bars lie beneath the card's glass,
 * which blurs the plate and not them. So when the first read answers, the slot is drawn afresh and ready:
 * the card is simply there, its words on its glass from its first frame, in place of the skeleton that
 * stood for it, if one was drawn at all (only a read that outlasts a quarter of a second draws one).
 */
export function CardSlot({
  loading,
  skeleton,
  style,
  children,
}: PropsWithChildren<{ loading: boolean; skeleton: ReactNode; style?: StyleProp<ViewStyle> }>) {
  return (
    <Resolve
      key={loading ? 'waiting' : 'there'}
      ready={!loading}
      skeleton={skeleton}
      style={style}
      each
    >
      {children}
    </Resolve>
  );
}

/** Inline, never replaces the scenic screen (INTERACTIONS_AND_STATES, Error). */
export function ErrorNotice({ summary }: { summary: HomeSummary }) {
  return (
    <GlassCard radius={tokens.radius.medium} strength="strong">
      <View style={styles.notice} accessibilityLiveRegion="polite">
        <EchoText variant="bodyM" color="textSecondary" style={styles.noticeText}>
          {homeLabels.loadError}
        </EchoText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={homeLabels.retry}
          onPress={() => void summary.refresh()}
          hitSlop={8}
          style={styles.retry}
        >
          <EchoText variant="label" color="textPrimary" style={styles.retryText}>
            {homeLabels.retry}
          </EchoText>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  skeleton: { padding: 18, justifyContent: 'center', gap: 12 },
  bar: { height: 9, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.14)' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    minHeight: 56,
    paddingVertical: 8,
  },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 19 },
  retry: { minHeight: tokens.size.tapTarget, justifyContent: 'center', paddingHorizontal: 6 },
  retryText: { fontSize: 12, letterSpacing: 1.6 },
});
