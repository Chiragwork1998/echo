import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { EchoBackground } from '@/components/EchoBackground';
import { EchoText } from '@/components/EchoText';
import { BlurSurface, GlassCard } from '@/components/GlassCard';
import { Icon, type IconName } from '@/components/Icon';
import { copy } from '@/content/copy';
import { clamp01, EASE } from '@/design/ease';
import { cue } from '@/design/haptics';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

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
/** The goldens recede unselected tabs to this. */
const IDLE = 0.62;
/** Night's bar floats this much higher than Day's: the move is a glide, never a hop. */
const GAP_DROP = BOTTOM_GAP.night - BOTTOM_GAP.day;
/** The selected dot follows the pill a moment later, as a bead follows the wake. */
const DOT_LAG_MS = 40;
/** Reduce Motion: the pill and dot fade out, are placed, and fade in. */
const SWAP_HALF_MS = 90;
/** A change of theme dips the tab row out before its icons swap, and back in on the new set. */
const DIP_MS = 240;
/** Where the dot sits below the row's top, until the first tab reports where its slot really is. */
const DOT_TOP_GUESS = PAD + 7 + ICON + 1 + 15 + 1;

const TABS = [
  { key: 'today', path: '/home', night: 'home', day: 'sun' },
  { key: 'echoes', path: '/home/echoes', night: 'layers', day: 'book' },
  { key: 'patterns', path: '/home/patterns', night: 'patterns', day: 'patterns' },
  { key: 'you', path: '/home/you', night: 'user', day: 'user' },
] as const;

export const tabPaths: readonly string[] = TABS.map((tab) => tab.path);

/**
 * The bar is drawn above the stack, so a bar that comes with the route is drawn over any screen that
 * has not yet gone when the route changes. Completion is popped by a route that changed before it had
 * left the screen, and the walk (v11) saw the bar over its card in two Enter your space of six; after
 * a Back it was 0.7 s late, behind a busy JS thread. A screen that leaves by a fade of its own tells the
 * bar here to come as that fade ends, on the UI thread, over a Home that is already whole beneath it.
 */
type Bar = {
  /** The bar gives what says how much of it is drawn. Returns how to take it back. */
  register: (shown: SharedValue<number>) => () => void;
  /** Brings the bar in `afterMs` from now. */
  reveal: (afterMs: number) => void;
};
const BarContext = createContext<Bar | null>(null);

/** Lets the screens of Home's stack reach the bar, which is drawn beside them, above the stack. */
export function HomeTabBarProvider({ children }: PropsWithChildren) {
  const shownRef = useRef<SharedValue<number> | null>(null);
  const bar = useMemo<Bar>(
    () => ({
      register: (shown) => {
        shownRef.current = shown;
        return () => {
          if (shownRef.current === shown) shownRef.current = null;
        };
      },
      reveal: (afterMs) => {
        shownRef.current?.set(
          withDelay(
            afterMs,
            withTiming(1, {
              duration: tokens.motion.fast,
              easing: EASE,
              reduceMotion: ReduceMotion.Never,
            }),
          ),
        );
      },
    }),
    [],
  );
  return <BarContext.Provider value={bar}>{children}</BarContext.Provider>;
}

const NO_BAR = () => undefined;

/**
 * Brings the bar in `afterMs` from now, over the time it always comes in: for a screen whose own fade
 * of that length is beginning, so that the bar comes once the screen has gone and never over it. Its
 * touches and its place for TalkBack still follow the route.
 */
export function useRevealTabBar(): (afterMs: number) => void {
  return useContext(BarContext)?.reveal ?? NO_BAR;
}

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
    /** Where the bar rests in this theme: the blurred slice of the plate lines up with it. */
    bottom,
    /** Where the bar's box is laid out, whatever the theme: the 8 pt between themes is a transform. */
    dockBottom: insets.bottom + BOTTOM_GAP.night,
  };
}

/**
 * Where the pill and the dot are, as a position between 0 and 3. A tap glides them there over 320 ms
 * on the shared ease, the dot 40 ms behind; each tap carries on from wherever they had got to, so
 * quick taps follow the latest target and never stack. While the bar is hidden (on the session or an
 * entry) it is placed at once. Reduce Motion: they fade out over 90 ms, are placed, and fade in.
 */
function useGlide(index: number, reduced: boolean) {
  const start = Math.max(index, 0);
  const pill = useSharedValue(start);
  const dot = useSharedValue(start);
  const veil = useSharedValue(1);
  const was = useRef({ index: start, onATab: index >= 0 });
  useEffect(() => {
    const before = was.current;
    const onATab = index >= 0;
    was.current = { index: onATab ? index : before.index, onATab };
    if (!onATab || index === before.index) return;
    if (!before.onATab) {
      // Arriving from a page that has no bar: it is not seen to move.
      pill.set(index);
      dot.set(index);
      return;
    }
    const never = { reduceMotion: ReduceMotion.Never };
    if (reduced) {
      veil.set(withTiming(0, { ...never, duration: SWAP_HALF_MS, easing: EASE }));
      const placed = setTimeout(() => {
        pill.set(index);
        dot.set(index);
        veil.set(withTiming(1, { ...never, duration: SWAP_HALF_MS, easing: EASE }));
      }, SWAP_HALF_MS);
      return () => clearTimeout(placed);
    }
    pill.set(withTiming(index, { ...never, duration: tokens.motion.standard, easing: EASE }));
    dot.set(
      withDelay(
        DOT_LAG_MS,
        withTiming(index, { ...never, duration: tokens.motion.standard, easing: EASE }),
      ),
    );
  }, [dot, index, pill, reduced, veil]);
  return { pill, dot, veil };
}

type ItemProps = {
  label: string;
  selected: boolean;
  night: boolean;
  index: number;
  pos: SharedValue<number>;
  icons: { night: IconName | 'layers'; day: IconName | 'layers' };
  primary: string;
  secondary: string;
  testID: string;
  onPress: () => void;
  /** Reports where this tab's dot slot is, so the one dot can sit in it. */
  onSlot?: (top: number) => void;
};

/**
 * One tab. Its icon and label are drawn twice, on top of each other: in the primary ink at the share
 * of the pill that is under it, and in the quiet ink at 0.62 of what is left. So the unselected tab
 * is the golden exactly, the selected one is full ink, and as the pill passes beneath, the ink
 * changes with it. The copies are hidden from accessibility: the Pressable carries the name.
 */
function TabItem({
  label,
  selected,
  night,
  index,
  pos,
  icons,
  primary,
  secondary,
  testID,
  onPress,
  onSlot,
}: ItemProps) {
  const name = night ? icons.night : icons.day;
  // How much of the pill is on this tab: 1 when it is there, 0 once it is a tab's width away.
  const under = useAnimatedStyle(() => ({ opacity: clamp01(1 - Math.abs(pos.get() - index)) }));
  const away = useAnimatedStyle(() => ({
    opacity: IDLE * (1 - clamp01(1 - Math.abs(pos.get() - index))),
  }));
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && !selected && styles.pressed]}
      testID={testID}
    >
      <View style={styles.iconBox}>
        <Animated.View style={[StyleSheet.absoluteFill, away]}>
          <TabIcon name={name} color={secondary} />
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, under]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <TabIcon name={name} color={primary} />
        </Animated.View>
      </View>
      <View>
        <Animated.View style={away}>
          <EchoText
            variant="caption"
            style={[styles.label, { color: secondary }]}
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
          >
            {label}
          </EchoText>
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, under]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <EchoText
            variant="caption"
            style={[styles.label, { color: primary }]}
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
          >
            {label}
          </EchoText>
        </Animated.View>
      </View>
      <View
        style={styles.dotSlot}
        onLayout={onSlot && ((event) => onSlot(event.nativeEvent.layout.y))}
      />
    </Pressable>
  );
}

/**
 * The four Home tabs. Rendered once by app/home/_layout.tsx, above the stack, so that it stays put
 * while tabs change and disappears for the session and completion screens.
 */
export function HomeTabBar() {
  const pathname = usePathname();
  const { name, target, colors } = useTheme();
  const reduced = useReduceMotion();
  const place = usePlacement();
  const visible = tabPaths.includes(pathname);
  const night = name === 'night';
  const index = TABS.findIndex((tab) => tab.path === pathname);
  const shown = useSharedValue(visible ? 1 : 0);
  // The bar melts away with Home when Begin is pressed, and comes back with it.
  const { progress, phase } = useHomeDissolve();
  const present = visible && phase === 'idle';

  // The screens of the stack can bring the bar in as they go (useRevealTabBar).
  const register = useContext(BarContext)?.register;
  useEffect(() => register?.(shown), [register, shown]);

  // Each change of route says again whether the bar is wanted, so that a bar brought in for a route
  // that then did not come is taken away again by the one that did. Already where it is wanted, it
  // carries on from where it is.
  useEffect(() => {
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: tokens.motion.fast,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [pathname, shown, visible]);

  // A change of theme: the bar glides the 8 pt between Night's height and Day's, the row of icons
  // dips out before its set is swapped and fades back in on the new one, and the pill follows Night.
  const drop = useSharedValue(night ? 0 : GAP_DROP);
  const nightness = useSharedValue(night ? 1 : 0);
  const dip = useSharedValue(1);
  const changing = !reduced && name !== target;
  useEffect(() => {
    drop.set(
      withTiming(night ? 0 : GAP_DROP, {
        duration: tokens.motion.standard,
        easing: EASE,
        reduceMotion: ReduceMotion.System,
      }),
    );
    nightness.set(
      withTiming(night ? 1 : 0, {
        duration: reduced ? tokens.motion.fast : tokens.motion.standard,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [drop, night, nightness, reduced]);
  useEffect(() => {
    dip.set(
      withTiming(changing ? 0 : 1, {
        duration: changing ? DIP_MS : tokens.motion.standard,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [changing, dip]);

  const fade = useAnimatedStyle(() => ({
    opacity: shown.get() * (1 - progress.get()),
    transform: [{ translateY: drop.get() }],
  }));
  const row = useAnimatedStyle(() => ({ opacity: dip.get() }));

  // The pill and the dot are one each, and move; the tabs only change their ink.
  const { pill, dot, veil } = useGlide(index, reduced);
  const [tabWidth, setTabWidth] = useState((place.barWidth - 2 - 2 * PAD) / TABS.length);
  const [dotTop, setDotTop] = useState(DOT_TOP_GUESS);
  const measure = (event: LayoutChangeEvent) =>
    setTabWidth((event.nativeEvent.layout.width - 2 * PAD) / TABS.length);
  const glide = useAnimatedStyle(() => ({
    opacity: nightness.get() * veil.get(),
    transform: [{ translateX: pill.get() * tabWidth }],
  }));
  const follow = useAnimatedStyle(() => ({
    opacity: veil.get(),
    transform: [{ translateX: dot.get() * tabWidth }],
  }));

  return (
    <Animated.View
      pointerEvents={present ? 'box-none' : 'none'}
      accessibilityElementsHidden={!present}
      importantForAccessibility={present ? 'auto' : 'no-hide-descendants'}
      style={[styles.dock, { bottom: place.dockBottom }, fade]}
      testID="home-dock"
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
            <Animated.View
              style={[styles.row, row]}
              accessibilityRole="tablist"
              testID="home-tabs"
              onLayout={measure}
            >
              <Animated.View
                pointerEvents="none"
                testID="home-tab-pill"
                style={[styles.slot, { width: tabWidth }, glide]}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.09)']}
                  style={styles.pill}
                  pointerEvents="none"
                />
              </Animated.View>
              {TABS.map((tab, i) => (
                <TabItem
                  key={tab.key}
                  label={copy.home.tabs[i] ?? tab.key}
                  selected={pathname === tab.path}
                  night={night}
                  index={i}
                  pos={pill}
                  icons={tab}
                  primary={colors.textPrimary}
                  secondary={colors.textSecondary}
                  testID={`home-tab-${tab.key}`}
                  onPress={() => {
                    if (pathname === tab.path) return;
                    cue('tick');
                    router.navigate(tab.path as never);
                  }}
                  onSlot={i === 0 ? (top) => setDotTop(PAD + top) : undefined}
                />
              ))}
              <Animated.View
                pointerEvents="none"
                testID="home-tab-dot"
                style={[
                  styles.dot,
                  {
                    top: dotTop,
                    left: PAD + (tabWidth - DOT) / 2,
                    backgroundColor: colors.textPrimary,
                  },
                  follow,
                ]}
              />
            </Animated.View>
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
  iconBox: { width: ICON, height: ICON },
  // The pill's room: one tab wide, inside the row's padding, carried along by its transform.
  slot: { position: 'absolute', left: PAD, top: PAD, bottom: PAD },
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
  dotSlot: { width: DOT, height: DOT, marginTop: 1 },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
});
