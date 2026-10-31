import { useRouter, type Href } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoIcon, type EchoIconName } from './EchoIcon';
import { GlassCard } from './GlassCard';
import { usePressScale } from '@/design/press';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

export type MainTab = 'today' | 'echoes' | 'patterns' | 'you';

export const TAB_BAR = { height: 72 } as const;

const TABS: readonly { icon: EchoIconName; id: MainTab; label: string; route: Href }[] = [
  { icon: 'sunrise', id: 'today', label: 'Today', route: '/home' },
  { icon: 'book', id: 'echoes', label: 'Echoes', route: '/echoes' },
  { icon: 'patterns', id: 'patterns', label: 'Patterns', route: '/patterns' },
  { icon: 'user', id: 'you', label: 'You', route: '/you' },
];

/** Full-width navigation base. Its material extends through the bottom safe area. */
export function TabBar({ active }: { active: MainTab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <GlassCard padding={0} style={[styles.bar, { height: TAB_BAR.height + insets.bottom }]} variant="strong">
      <View accessibilityRole="tablist" style={styles.row}>
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <Tab
              icon={tab.icon}
              key={tab.id}
              label={tab.label}
              onPress={() => {
                if (!selected) {
                  router.replace(tab.route);
                }
              }}
              selected={selected}
            />
          );
        })}
      </View>
    </GlassCard>
  );
}

function Tab({
  icon,
  label,
  onPress,
  selected,
}: {
  icon: EchoIconName;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { theme } = useEchoTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();

  return (
    <Animated.View style={[styles.tabWrap, animatedStyle]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        aria-selected={selected}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.tab}
      >
        {selected ? (
          <View
            pointerEvents="none"
            style={[
              styles.selectedCapsule,
              { backgroundColor: theme.color.surfaceSelected },
            ]}
          />
        ) : null}
        <EchoIcon
          color={selected ? theme.color.textPrimary : theme.color.textSecondary}
          name={icon}
          opacity={selected ? 1 : 0.82}
          size={tokens.size.icon}
        />
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: selected ? theme.color.textPrimary : theme.color.textSecondary },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { alignSelf: 'stretch', width: '100%', borderRadius: 0, flexShrink: 0, padding: 0 },
  row: { height: TAB_BAR.height, flexDirection: 'row', alignItems: 'center', padding: tokens.space[8] },
  tabWrap: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[4],
  },
  selectedCapsule: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: tokens.control.capsuleRadius,
  },
  label: {
    ...tokens.type.uiMedium,
    fontSize: 11,
    letterSpacing: tokens.typography.button.tracking,
    lineHeight: 14,
  },
});
