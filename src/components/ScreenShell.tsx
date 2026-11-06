import { type PropsWithChildren, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/design/layout';
import type { ScreenId } from '@/features/onboarding/flow';

import { EchoBackground } from './EchoBackground';
import { BlurSurface } from './GlassCard';

// The goldens place the header just inside the status-bar inset and the CTA 52 pt above the screen
// bottom. See docs/SPEC_CONFLICTS.md, C-03.
const HEADER_OFFSET_FROM_SAFE_TOP = -5;
const FOOTER_ABOVE_SAFE_BOTTOM = 18;

type Props = PropsWithChildren<{
  screen: ScreenId;
  header?: ReactNode;
  /** Pinned to the bottom. Primary CTA goes here. */
  footer?: ReactNode;
  /**
   * Full-screen layer pinned to the photograph, for controls that sit on scenery such as the river
   * points on Intent or the stones on Arrival. Position children with usePlatePoint. Screen readers
   * meet it after the header and content, and before the footer.
   */
  plateOverlay?: ReactNode;
}>;

/**
 * Every screen: full-bleed plate, safe-area UI layer, gutters, tablet column, and the scrolling
 * accessible layout at large text sizes. Screens only supply their content.
 */
export function ScreenShell({ screen, header, footer, plateOverlay, children }: Props) {
  const insets = useSafeAreaInsets();
  const { gutter, width, accessibleLayout, landscape } = useLayout();

  const body = (
    <View style={[styles.column, { width, paddingHorizontal: gutter }]} pointerEvents="box-none">
      {header}
      <View style={styles.content} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );

  const footerNode = footer ? (
    <View style={[styles.footer, { width, paddingHorizontal: gutter }]}>{footer}</View>
  ) : null;

  return (
    <View style={styles.root}>
      <BlurSurface backdrop={<EchoBackground screen={screen} />}>
        <View
          pointerEvents="box-none"
          style={[
            styles.layer,
            {
              paddingTop: Math.max(insets.top + HEADER_OFFSET_FROM_SAFE_TOP, 8),
              paddingBottom: insets.bottom + FOOTER_ABOVE_SAFE_BOTTOM,
            },
          ]}
        >
          {accessibleLayout || landscape ? (
            <ScrollView style={styles.fill} contentContainerStyle={styles.scroll}>
              {body}
            </ScrollView>
          ) : (
            body
          )}
          {!plateOverlay && footerNode}
        </View>
        {plateOverlay && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {plateOverlay}
          </View>
        )}
        {plateOverlay && footer && (
          // Rendered last so screen readers meet the choices before the button that confirms them.
          <View
            pointerEvents="box-none"
            style={[styles.pinnedFooter, { bottom: insets.bottom + FOOTER_ABOVE_SAFE_BOTTOM }]}
          >
            {footerNode}
          </View>
        )}
      </BlurSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  layer: { flex: 1, alignItems: 'center' },
  fill: { flex: 1, alignSelf: 'stretch' },
  scroll: { alignItems: 'center' },
  column: { flex: 1 },
  content: { flex: 1 },
  footer: { paddingTop: 12 },
  pinnedFooter: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
