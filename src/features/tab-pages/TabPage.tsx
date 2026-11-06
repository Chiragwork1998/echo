import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoBackground } from '@/components/EchoBackground';
import { EchoText } from '@/components/EchoText';
import { BlurSurface } from '@/components/GlassCard';
import { Icon } from '@/components/Icon';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useTabBarSpace } from '@/features/home/tabs/HomeTabBar';
import { NightFloor } from '@/features/home/today/NightHome';

import { OnPlate } from './parts';
import { pageCopy } from './pageCopy';
import { onPlate } from './textStyles';

// Same top inset as Home (docs/SPEC_CONFLICTS.md, C-03). Content ends this far above the tab bar.
const HEADER_OFFSET_FROM_SAFE_TOP = -5;
const ABOVE_TAB_BAR = 18;
const BELOW_CONTENT = 24;

type Props = PropsWithChildren<{
  title: string;
  /** Shows a Back button. Pages reached from a tab hide the tab bar and pass this. */
  onBack?: () => void;
  /** false on pages that hide the tab bar, so that nothing reserves room for it. */
  tabBar?: boolean;
}>;

/**
 * The one layout for Echoes, Patterns, You and the entry reader: the Home plate, a title, and a
 * single scrolling column that stops clear of the floating tab bar. It holds no logic, so a later
 * design pass can replace it wholesale.
 */
export function TabPage({ title, onBack, tabBar = true, children }: Props) {
  const { name, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, gutter } = useLayout();
  const tabBarSpace = useTabBarSpace();
  const bottom = tabBar ? tabBarSpace + ABOVE_TAB_BAR : insets.bottom + BELOW_CONTENT;
  const top = Math.max(insets.top + HEADER_OFFSET_FROM_SAFE_TOP, 8);

  return (
    <View style={styles.root}>
      <BlurSurface backdrop={<EchoBackground screen="home" />}>
        {name === 'night' && <NightFloor />}
        <ScrollView
          testID="tab-page-scroll"
          style={styles.fill}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingTop: top, paddingBottom: bottom }]}
        >
          <View style={[styles.column, { width, paddingHorizontal: gutter }]}>
            {onBack && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pageCopy.back}
                onPress={onBack}
                hitSlop={4}
                style={styles.back}
              >
                <Icon name="arrow-left" size={22} color={colors.textPrimary} />
              </Pressable>
            )}
            <View style={styles.title}>
              <OnPlate>
                <EchoText variant="displayM" accessibilityRole="header" style={onPlate}>
                  {title}
                </EchoText>
              </OnPlate>
            </View>
            {children}
          </View>
        </ScrollView>
      </BlurSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { gap: tokens.space[16] },
  back: {
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    justifyContent: 'center',
    marginLeft: -5,
  },
  title: { marginTop: tokens.space[8] },
});
