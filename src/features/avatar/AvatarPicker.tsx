import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import { haptics } from '@/services/haptics';
import { AvatarPet } from './AvatarPet';
import { AVATARS, getAvatar, type AvatarId } from './catalog';

export function AvatarPicker({ value, onSelect }: { value: AvatarId; onSelect: (id: AvatarId) => void }) {
  const { theme } = useEchoTheme();
  const { width } = useWindowDimensions();
  const available = Math.min(width - 48, 430) - 48;
  const tileWidth = Math.max(64, (available - 16) / 3);
  const selectedAvatar = getAvatar(value);

  return (
    <View style={styles.picker}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Echo Avatar" style={styles.grid}>
        {AVATARS.map(avatar => {
          const selected = avatar.id === value;
          return (
            <Pressable
              accessibilityLabel={avatar.name}
              accessibilityHint={avatar.description}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              key={avatar.id}
              onPress={() => { haptics.light(); onSelect(avatar.id); }}
              style={({ pressed }) => [
                styles.tile,
                { width: tileWidth, backgroundColor: selected ? theme.color.surfaceSelected : 'rgba(255,255,255,0.025)' },
                pressed && styles.pressed,
              ]}
            >
              <AvatarPet id={avatar.id} size={48} animated={selected} />
              <Text numberOfLines={1} style={[styles.name, { color: selected ? theme.color.accentWarm : theme.color.textPrimary }]}>{avatar.name}</Text>
              {selected ? <View style={[styles.selected, { backgroundColor: theme.color.accentWarm }]} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.description, { color: theme.color.textSecondary }]}>{selectedAvatar.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { minHeight: 86, borderRadius: 16, paddingTop: 8, paddingBottom: 9, alignItems: 'center', justifyContent: 'center', gap: 5 },
  name: { ...tokens.type.uiMedium, fontSize: 10, lineHeight: 14, maxWidth: '100%', paddingHorizontal: 4 },
  selected: { position: 'absolute', width: 4, height: 4, borderRadius: 2, top: 8, right: 8 },
  description: { ...tokens.type.ui, fontSize: 12, lineHeight: 19, minHeight: 38 },
  pressed: { opacity: 0.7 },
});
