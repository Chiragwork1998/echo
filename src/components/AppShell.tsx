import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { EchoTheme } from '@/design/themes';

type AppShellProps = PropsWithChildren<{ theme: EchoTheme; background?: ReactNode }>;

export function AppShell({ background, children, theme }: AppShellProps) {
  return (
    <View style={[styles.root, { backgroundColor: theme.color.textInk }]}>
      {background}
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, safeArea: { flex: 1 } });
