import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { TideLine } from '@/components/TideLine';
import { tokens } from '@/design/tokens';
import { Surface } from '@/features/tab-pages/parts';

type Props = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  hint?: string;
};

const HEIGHT = 48;

/**
 * A second action, quieter than the cream one: a pill of glass with the label set as the goldens set
 * their buttons, in sentence case with open tracking. 48 pt tall. While it works the label stays,
 * dimmed, and a hairline of warm light travels along the pill's lower inner edge, clipped by its
 * curve; the caller's label says the work in words.
 */
export function QuietAction({ label, onPress, busy, hint }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}
    >
      <Surface radius={HEIGHT / 2}>
        <View style={styles.inside}>
          <EchoText
            variant="label"
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={busy ? styles.working : undefined}
          >
            {label}
          </EchoText>
          {busy ? <TideLine /> : null}
        </View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  working: { opacity: 0.72 },
  inside: {
    minHeight: HEIGHT,
    minWidth: 200,
    paddingHorizontal: tokens.space[24],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
