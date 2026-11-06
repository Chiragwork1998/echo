import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoBackground } from '@/components/EchoBackground';
import { BlurSurface } from '@/components/GlassCard';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { useHomeSummary } from '@/features/journal';

import { useTabBarSpace } from '../tabs/HomeTabBar';
import { DayHome } from '../today/DayHome';
import { NightFloor, NightHome } from '../today/NightHome';

// The goldens place the header just inside the status-bar inset (docs/SPEC_CONFLICTS.md, C-03).
const HEADER_OFFSET_FROM_SAFE_TOP = -5;
// Night's content ends 18 pt above its bar. Day's list runs lower in the golden, so it sits closer.
const ABOVE_TAB_BAR = { night: 18, day: 8 } as const;

/**
 * Home. Night and Day are two compositions, both intentional (docs/SPEC_CONFLICTS.md, C-09). The
 * plate, scroll view and data live above the choice, so changing theme swaps what is drawn and
 * keeps the scroll position and everything the data hook holds.
 */
export function HomeScreen() {
  const { name } = useTheme();
  const summary = useHomeSummary();
  const insets = useSafeAreaInsets();
  const { width, gutter } = useLayout();
  const tabBarSpace = useTabBarSpace();
  const night = name === 'night';

  return (
    <View style={styles.root}>
      <BlurSurface backdrop={<EchoBackground screen="home" />}>
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
            {night ? <NightHome summary={summary} /> : <DayHome summary={summary} />}
          </View>
        </ScrollView>
      </BlurSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { flexGrow: 1 },
});
