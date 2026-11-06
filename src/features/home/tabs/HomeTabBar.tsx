import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { EchoBackground } from '@/components/EchoBackground';
import { EchoText } from '@/components/EchoText';
import { BlurSurface, GlassCard } from '@/components/GlassCard';
import { Icon, type IconName } from '@/components/Icon';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { useHomeDissolve } from '../dissolve';

export const TAB_BAR_HEIGHT = tokens.size.tabBarHeight; // 72
const BAR_RADIUS = 30;
/**
 * Above the safe area. The goldens float the bar off the screen edge by different amounts: Night's
 * sits higher, and Day's lower, beneath a longer list.
 */
const BOTTOM_GAP = { night: 11, day: 3 } as const;
const PAD = 4;
const PILL_INSET = 6;
const DOT = 4;
const ICON = 21;

const TABS = [
  { key: 'today', path: '/home', night: 'home', day: 'sun' },
  { key: 'echoes', path: '/home/echoes', night: 'layers', day: 'book' },
  { key: 'patterns', path: '/home/patterns', night: 'patterns', day: 'patterns' },
  { key: 'you', path: '/home/you', night: 'user', day: 'user' },
] as const;

export const tabPaths: readonly string[] = TABS.map((tab) => tab.path);

/** Space a Home tab needs at the bottom so that nothing sits under the bar. */
export function useTabBarSpace() {
  const { bottom } = useSafeAreaInsets();
  const { name } = useTheme();
  return bottom + BOTTOM_GAP[name] + TAB_BAR_HEIGHT;
}

/** The handoff's icon set has no layers glyph, which Night's Echoes tab shows. Same 1.5 stroke. */
function LayersIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Path
        d="M12 3l9 5-9 5-9-5 9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function TabIcon({ name, color }: { name: IconName | 'layers'; color: string }) {
  return name === 'layers' ? (
    <LayersIcon color={color} />
  ) : (
    <Icon name={name} size={ICON} color={color} />
  );
}

/** Where the bar sits on the screen, so its glass can blur the matching slice of the plate. */
function usePlacement() {
  const { width: window, height } = useWindowDimensions();
  const { width, gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const { name } = useTheme();
  const barWidth = Math.min(width - gutter * 2, 382);
  const bottom = insets.bottom + BOTTOM_GAP[name];
  return {
    window,
    height,
    barWidth,
    left: (window - barWidth) / 2,
    top: height - bottom - TAB_BAR_HEIGHT,
    bottom,
  };
}

/**
 * The four Home tabs. Rendered once by app/home/_layout.tsx, above the stack, so that it stays put
 * while tabs change and disappears for the session and completion screens.
 */
export function HomeTabBar() {
  const pathname = usePathname();
  const { name, colors } = useTheme();
  const place = usePlacement();
  const visible = tabPaths.includes(pathname);
  const night = name === 'night';
  const shown = useSharedValue(visible ? 1 : 0);
  // The bar melts away with Home when Begin is pressed, and comes back with it.
  const { progress, phase } = useHomeDissolve();
  const present = visible && phase === 'idle';

  useEffect(() => {
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: tokens.motion.fast,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [shown, visible]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() * (1 - progress.get()) }));

  return (
    <Animated.View
      pointerEvents={present ? 'box-none' : 'none'}
      accessibilityElementsHidden={!present}
      importantForAccessibility={present ? 'auto' : 'no-hide-descendants'}
      style={[styles.dock, { bottom: place.bottom }, fade]}
    >
      <View style={[styles.bar, { width: place.barWidth }]}>
        <BlurSurface
          backdrop={
            // The slice of the plate beneath the bar. Glass blurs this on every platform.
            <View
              style={{
                position: 'absolute',
                left: -place.left,
                top: -place.top,
                width: place.window,
                height: place.height,
              }}
            >
              <EchoBackground screen="home" />
            </View>
          }
        >
          <GlassCard radius={BAR_RADIUS} style={styles.glass} contentStyle={styles.fill}>
            <View style={styles.row} accessibilityRole="tablist">
              {TABS.map((tab, index) => {
                const selected = pathname === tab.path;
                const label = copy.home.tabs[index] ?? tab.key;
                const tint = selected ? colors.textPrimary : colors.textSecondary;
                return (
                  <Pressable
                    key={tab.key}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      if (selected) return;
                      Haptics.selectionAsync();
                      router.navigate(tab.path as never);
                    }}
                    style={({ pressed }) => [styles.tab, pressed && !selected && styles.pressed]}
                    testID={`home-tab-${tab.key}`}
                  >
                    {selected && night && (
                      <LinearGradient
                        colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.09)']}
                        style={styles.pill}
                        pointerEvents="none"
                      />
                    )}
                    <View style={!selected && styles.idle}>
                      <TabIcon name={night ? tab.night : tab.day} color={tint} />
                    </View>
                    <EchoText
                      variant="caption"
                      style={[styles.label, { color: tint }, !selected && styles.idle]}
                      maxFontSizeMultiplier={1.2}
                      numberOfLines={1}
                    >
                      {label}
                    </EchoText>
                    <View
                      style={[styles.dot, { backgroundColor: selected ? tint : 'transparent' }]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </GlassCard>
        </BlurSurface>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: { height: TAB_BAR_HEIGHT, borderRadius: BAR_RADIUS, overflow: 'hidden' },
  glass: { height: TAB_BAR_HEIGHT },
  fill: { height: TAB_BAR_HEIGHT - 2 },
  row: { flex: 1, flexDirection: 'row', padding: PAD },
  tab: {
    flex: 1,
    minHeight: tokens.size.tapTarget,
    alignItems: 'center',
    paddingTop: 7,
    borderRadius: 26,
  },
  pressed: { opacity: 0.7 },
  // The goldens recede unselected tabs, so the current place reads at a glance.
  idle: { opacity: 0.62 },
  pill: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: PILL_INSET - PAD,
    bottom: PILL_INSET - PAD,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    boxShadow: '0 6px 14px rgba(0,0,0,0.28)',
  },
  label: { marginTop: 1, fontSize: 10.5, lineHeight: 15, letterSpacing: 0.2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 1 },
});
