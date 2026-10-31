import { BlurView } from 'expo-blur';
import { useContext } from 'react';
import { StyleSheet, View } from 'react-native';

import { GlassBackdrop } from './GlassCard';
import { useEchoTheme } from '@/design/ThemeProvider';

/** Frosted white material. Its clipped container uses zIndex: 0 to keep all text above it. */
export function ContentBackdrop() {
  const { theme } = useEchoTheme();
  const blurTarget = useContext(GlassBackdrop);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: -1 }]}
      testID="content-backdrop"
    >
      <BlurView
        blurMethod={blurTarget ? 'dimezisBlurViewSdk31Plus' : undefined}
        blurTarget={blurTarget ?? undefined}
        intensity={24}
        style={StyleSheet.absoluteFill}
        tint="light"
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.surfaceContent }]} />
    </View>
  );
}
