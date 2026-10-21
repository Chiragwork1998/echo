import { BlurView } from 'expo-blur';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

/**
 * Blur values from `product-handoff/design/tokens.json` § blur: glass 24 pt,
 * strong 32 pt. Glass keeps the backdrop blur, a hairline white border and a
 * controlled dark scrim; it is never an opaque black card.
 */
const GLASS_BLUR = { regular: 24, strong: 32 } as const;

type GlassCardProps = PropsWithChildren<{
  accessibilityLabel?: string;
  focused?: boolean;
  /** Inner padding; pass 0 for chrome like the tab bar. */
  padding?: number;
  style?: StyleProp<ViewStyle>;
  /** `strong` is for copy that sits over bright photography. */
  variant?: 'regular' | 'strong';
}>;

export function GlassCard({
  accessibilityLabel,
  children,
  focused = false,
  padding = 18,
  style,
  variant = 'regular',
}: GlassCardProps) {
  const { theme } = useEchoTheme();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.card,
        { borderColor: focused ? theme.color.focus : theme.color.borderGlass },
        style,
      ]}
    >
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={GLASS_BLUR[variant]}
        style={StyleSheet.absoluteFill}
        tint="dark"
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              variant === 'strong' ? theme.color.surfaceGlassStrong : theme.color.surfaceGlass,
          },
        ]}
      />
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
