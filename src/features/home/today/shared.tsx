import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { GlassCard } from '@/components/GlassCard';
import { EASE } from '@/design/ease';
import { backgroundSources } from '@/design/generated/backgrounds';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import type { HomeSummary } from '@/features/journal';

import { homeLabels } from './homeLabels';

export const SESSION_PATH = '/home/session';
export const ECHOES_PATH = '/home/echoes';
export const YOU_PATH = '/home/you';

// Routes owned by other agents or not yet generated into expo-router's types. The session is not
// here: its entrances dissolve Home first, so they live in ../dissolve (useSessionEntry).
export const go = (href: string | { pathname: string; params: Record<string, string> }) =>
  router.navigate(href as never);
export const openEntry = (entryId: string) =>
  router.navigate({ pathname: ECHOES_PATH, params: { entryId } } as never);

/** The device's wall-clock time, refreshed each half minute. Never leaves the phone. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** A crop of the Home plate, so a thumbnail always looks like where the person is. */
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
  const imageWidth = size / focus.width;
  const imageHeight = imageWidth * (2796 / 1290);
  return (
    <View
      style={{ width: size, height, borderRadius: radius, overflow: 'hidden' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={backgroundSources[name].home}
        contentFit="fill"
        transition={0}
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

/** A read that is done sooner than this shows no placeholder at all: a card for a frame is a flicker. */
const SKELETON_DELAY_MS = 150;

/**
 * Quiet placeholder while the first read finishes. Same footprint as the card it stands in for, and
 * it comes in only if the read is taking a moment. The slot keeps its height meanwhile, so nothing
 * moves when the card, or the real thing, arrives.
 */
export function CardSkeleton({ height }: { height: number }) {
  const reduced = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withDelay(
        SKELETON_DELAY_MS,
        withTiming(1, {
          duration: reduced ? tokens.motion.fast : tokens.motion.standard,
          easing: EASE,
          reduceMotion: ReduceMotion.Never,
        }),
      ),
    );
  }, [reduced, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <Animated.View style={fade}>
      <GlassCard radius={tokens.radius.medium}>
        <View
          style={[styles.skeleton, { height }]}
          accessible
          accessibilityLabel={homeLabels.loading}
          accessibilityState={{ busy: true }}
        >
          <View style={[styles.bar, { width: '38%' }]} />
          <View style={[styles.bar, { width: '70%', height: 12 }]} />
        </View>
      </GlassCard>
    </Animated.View>
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
