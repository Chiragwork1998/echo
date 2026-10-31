import { BlurView } from 'expo-blur';
import { createContext, useContext, type PropsWithChildren, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

/**
 * Blur values from `product-handoff/design/tokens.json` § blur: glass 24 pt,
 * strong 32 pt. Glass keeps the backdrop blur and a
 * controlled dark scrim; it is never an opaque black card.
 */
const GLASS_BLUR = { regular: 24, strong: 32 } as const;

/**
 * The layer glass blurs on Android: AppShell wraps the plate and scrim in a
 * `BlurTargetView` and provides its ref here. Android only blurs against a
 * target; without one the card keeps the tinted fallback and requests no blur.
 */
export const GlassBackdrop = createContext<RefObject<View | null> | null>(null);

type GlassCardProps = PropsWithChildren<{
  accessibilityLabel?: string;
  focused?: boolean;
  /**
   * Set inside a `Modal`: Android draws modals in their own window, which
   * cannot blur the screen behind it, so the tinted fallback is used there.
   */
  inModal?: boolean;
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
  inModal = false,
  padding = 18,
  style,
  variant = 'regular',
}: GlassCardProps) {
  const { theme } = useEchoTheme();
  const backdrop = useContext(GlassBackdrop);
  const blurTarget = inModal ? null : backdrop;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.card,
        focused && { backgroundColor: theme.color.surfaceSelected },
        style,
      ]}
    >
      <BlurView
        blurMethod={blurTarget ? 'dimezisBlurViewSdk31Plus' : undefined}
        blurTarget={blurTarget ?? undefined}
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
      <View style={{ flexGrow: 1, flexShrink: 1, minHeight: 0, padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.card,
    overflow: 'hidden',
  },
});
