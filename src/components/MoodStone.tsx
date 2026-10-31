import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

/** Minimum 56 pt hit target (`specs/COMPONENTS.md` § MoodStone). */
export const MOOD_STONE_SIZE = 56;

type MoodStoneProps = {
  label: string;
  onPress: () => void;
  selected: boolean;
  /** On the frosted content surface: ink stones and labels, with the warm glow behind the selected stone. */
  onContent?: boolean;
};

/**
 * Single-select arrival stone. Selection is shown by a warm ripple: the stone
 * brightens and a soft filled glow sits behind it.
 */
export function MoodStone({ label, onPress, selected, onContent = false }: MoodStoneProps) {
  const { theme } = useEchoTheme();
  const stoneColor = onContent
    ? selected ? theme.color.textContent : theme.color.textContentSecondary
    : selected ? theme.color.accentWarm : theme.color.textSecondary;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.target, pressed && styles.pressed]}
    >
      <View style={styles.stoneWrap}>
        {selected ? (
          <View
            pointerEvents="none"
            style={[styles.ripple, { backgroundColor: onContent ? theme.color.accentWarm : theme.color.surfaceSelected }]}
          />
        ) : null}
        <View style={styles.stack}>
          <View
            style={[
              styles.layer,
              styles.base,
              { backgroundColor: stoneColor, opacity: selected ? 0.94 : 0.6 },
            ]}
          />
          <View style={[styles.layer, styles.middle, { backgroundColor: stoneColor }]} />
          <View style={[styles.layer, styles.top, { backgroundColor: stoneColor }]} />
        </View>
      </View>
      <Text
        style={[
          styles.label,
          { color: onContent ? theme.color.textContent : theme.color.textPrimary },
          selected && { ...tokens.type.uiMedium },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: MOOD_STONE_SIZE + tokens.space[24],
    minWidth: MOOD_STONE_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
  stoneWrap: { width: MOOD_STONE_SIZE, height: MOOD_STONE_SIZE, alignItems: 'center', justifyContent: 'center' },
  ripple: {
    position: 'absolute',
    width: MOOD_STONE_SIZE + 12,
    height: MOOD_STONE_SIZE + 12,
    borderRadius: (MOOD_STONE_SIZE + 12) / 2,
    opacity: 0.6,
  },
  stack: { width: MOOD_STONE_SIZE, height: MOOD_STONE_SIZE, alignItems: 'center', justifyContent: 'flex-end' },
  layer: { position: 'absolute', borderRadius: 999 },
  base: { bottom: 6, width: 46, height: 15 },
  middle: { bottom: 20, width: 34, height: 13 },
  top: { bottom: 32, width: 22, height: 11 },
  label: {
    marginTop: tokens.space[8],
    ...tokens.type.ui,
    fontSize: tokens.typography.caption.size + 1,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: tokens.typography.caption.lineHeight,
    textAlign: 'center',
  },
});
