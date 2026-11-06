import { type PropsWithChildren, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/design/layout';
import type { ScreenId } from '@/features/onboarding/flow';

import { EchoBackground } from './EchoBackground';
import { BlurSource } from './GlassCard';

// The goldens place the header just inside the status-bar inset and the CTA 52 pt above the screen
// bottom. See docs/SPEC_CONFLICTS.md, C-03.
const HEADER_OFFSET_FROM_SAFE_TOP = -5;
const FOOTER_ABOVE_SAFE_BOTTOM = 18;

type Props = PropsWithChildren<{
  screen: ScreenId;
  header?: ReactNode;
  /** Pinned to the bottom. Primary CTA goes here. */
  footer?: ReactNode;
}>;

/**
 * Every screen: full-bleed plate, safe-area UI layer, gutters, tablet column, and the scrolling
 * accessible layout at large text sizes. Screens only supply their content.
 */
export function ScreenShell({ screen, header, footer, children }: Props) {
  const insets = useSafeAreaInsets();
  const { gutter, width, accessibleLayout } = useLayout();

  const body = (
    <View style={[styles.column, { width, paddingHorizontal: gutter }]}>
      {header}
      <View style={styles.content}>{children}</View>
    </View>
  );

  return (
    <View style={styles.root}>
      <BlurSource>
        <EchoBackground screen={screen} />
      </BlurSource>
      <View
        style={[
          styles.layer,
          {
            paddingTop: Math.max(insets.top + HEADER_OFFSET_FROM_SAFE_TOP, 8),
            paddingBottom: insets.bottom + FOOTER_ABOVE_SAFE_BOTTOM,
          },
        ]}
      >
        {accessibleLayout ? (
          <ScrollView style={styles.fill} contentContainerStyle={styles.scroll}>
            {body}
          </ScrollView>
        ) : (
          body
        )}
        {footer && (
          <View style={[styles.footer, { width, paddingHorizontal: gutter }]}>{footer}</View>
        )}
      </View>
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
});
