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

import { pageCopy } from './pageCopy';
import { detail, onPlate } from './textStyles';

// Same top inset as Home (docs/SPEC_CONFLICTS.md, C-03). Content ends this far above the tab bar.
const HEADER_OFFSET_FROM_SAFE_TOP = -5;
const ABOVE_TAB_BAR = 24;
const BELOW_CONTENT = 32;

type Props = PropsWithChildren<{
  title: string;
  /** One quiet line under the title, as the goldens pair a heading with a subtitle. */
  subtitle?: string;
  /** Shows a Back button. Pages reached from a tab hide the tab bar and pass this. */
  onBack?: () => void;
  /** false on pages that hide the tab bar, so that nothing reserves room for it. */
  tabBar?: boolean;
}>;

/**
 * The one layout for Echoes, Patterns, You and the entry reader: the Home plate, a title, and a
 * single scrolling column that stops clear of the floating tab bar.
 *
 * The title sits on the sky. Day's sky is bright, so there it is set in ink, as Day Home sets its
 * headline; Night's is dark, so there it is cream with the plate's faint shadow. Below the title
 * everything rests on glass or carries its own local treatment.
 */
export function TabPage({ title, subtitle, onBack, tabBar = true, children }: Props) {
  const { name, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, gutter } = useLayout();
  const tabBarSpace = useTabBarSpace();
  const bottom = tabBar ? tabBarSpace + ABOVE_TAB_BAR : insets.bottom + BELOW_CONTENT;
  const top = Math.max(insets.top + HEADER_OFFSET_FROM_SAFE_TOP, 8);
  const day = name === 'day';
  const ink = day ? colors.textInk : colors.textPrimary;
  const shadow = day ? undefined : onPlate;

  return (
    <View style={styles.root}>
      <BlurSurface backdrop={<EchoBackground screen="home" />}>
        {name === 'night' && <NightFloor />}
        {/* The scrolling begins below the status bar, as on the onboarding screens (ScreenShell), so
            words scrolled up go out of sight there and never pass under the clock. At rest the title
            sits where it always has. */}
        <ScrollView
          testID="tab-page-scroll"
          style={[styles.fill, { marginTop: top }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View
            testID="tab-page-column"
            style={[styles.column, { width, paddingHorizontal: gutter, paddingBottom: bottom }]}
          >
            {onBack && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pageCopy.back}
                onPress={onBack}
                hitSlop={4}
                style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              >
                <Icon name="arrow-left" size={22} color={ink} />
              </Pressable>
            )}
            <View style={[styles.header, onBack ? styles.headerUnderBack : null]}>
              <EchoText
                variant="displayM"
                accessibilityRole="header"
                maxFontSizeMultiplier={1.4}
                style={[{ color: ink }, shadow]}
              >
                {title}
              </EchoText>
              {subtitle ? (
                <EchoText
                  variant="bodyM"
                  maxFontSizeMultiplier={1.6}
                  style={[detail, styles.subtitle, { color: ink }, shadow]}
                >
                  {subtitle}
                </EchoText>
              ) : null}
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
  // Nothing set on the plate may push the column sideways, so it never scrolls across.
  column: { gap: tokens.space[24], overflow: 'hidden' },
  back: {
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    justifyContent: 'center',
    marginLeft: -5,
    marginBottom: -tokens.space[16],
  },
  pressed: { opacity: 0.6 },
  header: { marginTop: tokens.space[8], gap: tokens.space[4] },
  headerUnderBack: { marginTop: 0 },
  subtitle: { opacity: 0.86 },
});
