import { BlurTargetView } from 'expo-blur';
import { useRef, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { GlassBackdrop } from './GlassCard';
import { ReadabilityScrim } from './ReadabilityScrim';
import { useEchoInsets } from '@/design/safeArea';
import type { EchoTheme } from '@/design/themes';

type AppShellProps = PropsWithChildren<{
  theme: EchoTheme;
  background?: ReactNode;
  /** A bottom navigation bar can own its safe-area padding. */
  insetBottom?: boolean;
}>;

export function AppShell({ background, children, insetBottom = true, theme }: AppShellProps) {
  const insets = useEchoInsets();
  const backdrop = useRef<View>(null);

  return (
    <View style={[styles.root, { backgroundColor: theme.color.textInk }]}>
      {/* What glass cards blur on Android; they must stay outside this target. */}
      <BlurTargetView ref={backdrop} style={StyleSheet.absoluteFill}>
        {background}
        <ReadabilityScrim />
      </BlurTargetView>
      <GlassBackdrop.Provider value={backdrop}>
        <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insetBottom ? insets.bottom : 0 }]}>
          {children}
        </View>
      </GlassBackdrop.Provider>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, safeArea: { flex: 1 } });
