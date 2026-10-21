import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppShell } from './AppShell';
import { EchoBackground } from './EchoBackground';
import { EchoWordmark } from './EchoWordmark';
import { TabBar, type MainTab } from './TabBar';
import { screenBackgrounds, screenFocalPoints } from '@/design/backgrounds';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

/** Keeps the last scroll item clear of the sticky tab bar. */
export const TAB_BAR_CLEARANCE = tokens.size.tabBarHeight + tokens.space[32];

/**
 * Shared frame for the Echoes, Patterns and You route shells: the Home plate
 * keeps the atmosphere, the tab bar stays sticky and only functional content is
 * rendered until their golden screens are approved.
 */
export function TabScreen({
  children,
  tab,
  title,
}: {
  children: ReactNode;
  tab: MainTab;
  title: string;
}) {
  const { name, theme } = useEchoTheme();

  return (
    <AppShell
      theme={theme}
      background={
        <EchoBackground
          fallbackColor={theme.color.textInk}
          focalPoint={screenFocalPoints.home}
          source={screenBackgrounds[name].home}
        />
      }
    >
      <View style={styles.frame}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <EchoWordmark />
          <Text accessibilityRole="header" style={[styles.title, { color: theme.color.textPrimary }]}>
            {title}
          </Text>
          <View style={styles.body}>{children}</View>
        </ScrollView>
        <View style={styles.tabBarHost}>
          <TabBar active={tab} />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: {
    paddingHorizontal: tokens.layout.gutter,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  title: {
    marginTop: tokens.space[32],
    ...tokens.type.display,
    fontSize: tokens.typography.displayM.size - 2,
    letterSpacing: tokens.typography.displayM.tracking,
    lineHeight: tokens.typography.displayM.lineHeight,
  },
  body: { marginTop: tokens.space[20] },
  /**
   * Laid out in flow rather than pinned absolutely: the tab bar then keeps a
   * constant 15 pt above the home-indicator inset on every platform, matching
   * the golden, instead of drifting into the indicator region.
   */
  tabBarHost: {
    paddingHorizontal: tokens.layout.gutter,
    paddingTop: tokens.space[8],
    paddingBottom: 15,
    alignItems: 'center',
  },
});
