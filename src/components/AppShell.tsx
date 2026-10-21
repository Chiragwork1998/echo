import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ReadabilityScrim } from './ReadabilityScrim';
import { useEchoInsets } from '@/design/safeArea';
import type { EchoTheme } from '@/design/themes';

type AppShellProps = PropsWithChildren<{ theme: EchoTheme; background?: ReactNode }>;

export function AppShell({ background, children, theme }: AppShellProps) {
  const insets = useEchoInsets();

  return (
    <View style={[styles.root, { backgroundColor: theme.color.textInk }]}>
      {background}
      <ReadabilityScrim />
      <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, safeArea: { flex: 1 } });
