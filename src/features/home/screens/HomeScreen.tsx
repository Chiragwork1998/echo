import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { useThemeSwap } from '@/design/useThemeSwap';
import { useHomeSummary } from '@/features/journal';

import { useHomeDissolve, useHomeVeil, useWhileHere } from '../dissolve';
import { useTabBarSpace } from '../tabs/HomeTabBar';
import { DayHome } from '../today/DayHome';
import { NightFloor, NightHome } from '../today/NightHome';
import { useStoneArrival } from '../today/useStoneArrival';

// The goldens place the header just inside the status-bar inset (docs/SPEC_CONFLICTS.md, C-03).
const HEADER_OFFSET_FROM_SAFE_TOP = -5;
// Night's content ends 18 pt above its bar. Day's list runs lower in the golden, so it sits closer.
const ABOVE_TAB_BAR = { night: 18, day: 8 } as const;

/**
 * Home. Night and Day are two compositions, both intentional (docs/SPEC_CONFLICTS.md, C-09). The
 * scroll view and data live above the choice, so changing theme swaps what is drawn and keeps the
 * scroll position and everything the data hook holds. The photograph is not here: the layout draws
 * it once, beneath the stack.
 */
export function HomeScreen() {
  const { name } = useTheme();
  // Home as the person last saw it until the moment a stone is set, and what to play then.
  const { summary, stones } = useStoneArrival(useHomeSummary());
  const insets = useSafeAreaInsets();
  const { width, gutter } = useLayout();
  const tabBarSpace = useTabBarSpace();
  const night = name === 'night';
  // Pressing Begin dissolves everything but the photograph, which is drawn outside the veil and
  // never moves. The floor shade is part of the dissolve: the session's plate has none.
  const { phase } = useHomeDissolve();
  const veil = useHomeVeil();
  // Night and Day are two compositions: when the theme changes the one in view fades out, the other
  // takes its place while nothing is showing, and comes in over the new sky.
  const swap = useThemeSwap();
  const dip = useAnimatedStyle(() => ({ opacity: swap.get() }));
  const dissolved = phase !== 'idle';
  const here = useWhileHere();

  return (
    <View style={styles.root}>
      {/* Gone with the rest of the chrome, and back with it. Nothing else here touches it. */}
      <StatusBar hidden={phase === 'gone' && here ? true : undefined} animated />
      {/* No photograph here. This screen is transparent over the one app/home/_layout.tsx draws
          beneath the stack, still or alive (D-009), which is also what the glass below blurs. A
          copy of its own would cover the loop. */}
      <Animated.View
        style={[styles.fill, veil]}
        pointerEvents={dissolved ? 'none' : 'box-none'}
        accessibilityElementsHidden={dissolved}
        importantForAccessibility={dissolved ? 'no-hide-descendants' : 'auto'}
      >
        <Animated.View testID="home-swap" style={[styles.fill, dip]}>
          {night && <NightFloor />}
          {/* Scrolls only when the content is taller than the screen. The tab bar is not inside it. */}
          <ScrollView
            testID="home-scroll"
            style={styles.fill}
            contentContainerStyle={[
              styles.scroll,
              {
                paddingTop: Math.max(insets.top + HEADER_OFFSET_FROM_SAFE_TOP, 8),
                paddingBottom: tabBarSpace + ABOVE_TAB_BAR[name],
              },
            ]}
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.column, { width, paddingHorizontal: gutter }]}>
              {night ? (
                <NightHome summary={summary} stones={stones} />
              ) : (
                <DayHome summary={summary} stones={stones} />
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { flexGrow: 1 },
});
