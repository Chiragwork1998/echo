import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { HomeTabBar } from '@/features/home/tabs/HomeTabBar';

/**
 * Today, Echoes, Patterns and You share one tab bar, drawn above the stack. It shows on those four
 * routes only, so Session and Completion, which sit in this stack, fill the screen.
 */
export default function HomeLayout() {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          animationDuration: tokens.motion.standard,
          contentStyle: { backgroundColor: colors.textInk },
        }}
      />
      <HomeTabBar />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
