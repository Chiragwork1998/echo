import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppShell } from "./AppShell";
import { EchoBackground } from "./EchoBackground";
import { EchoWordmark } from "./EchoWordmark";
import { TabBar, type MainTab } from "./TabBar";
import { screenBackgrounds, screenFocalPoints } from "@/design/backgrounds";
import { useEchoTheme } from "@/design/ThemeProvider";
import { tokens } from "@/design/tokens";

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
      insetBottom={false}
      theme={theme}
      background={
        <>
          <EchoBackground
            fallbackColor={theme.color.textInk}
            focalPoint={screenFocalPoints.home}
            source={screenBackgrounds[name].home}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  name === "day" ? "rgba(5,16,30,0.42)" : "rgba(5,16,30,0.24)",
              },
            ]}
          />
        </>
      }
    >
      <View style={styles.frame}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <EchoWordmark />
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.color.textPrimary }]}
          >
            {title}
          </Text>
          <View style={styles.body}>{children}</View>
        </ScrollView>
        <TabBar active={tab} />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: tokens.layout.gutter,
    paddingBottom: tokens.space[32],
  },
  title: {
    marginTop: tokens.space[32],
    ...tokens.type.display,
    fontSize: tokens.typography.displayM.size - 2,
    letterSpacing: tokens.typography.displayM.tracking,
    lineHeight: tokens.typography.displayM.lineHeight,
  },
  body: { marginTop: tokens.space[20] },
});
