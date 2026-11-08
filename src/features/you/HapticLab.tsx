import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { cue, type Cue } from '@/design/haptics';
import { tokens } from '@/design/tokens';
import { useTone } from '@/features/onboarding/rhythm/tone';
import { Sheet, SheetText, SheetTitle } from '@/features/tab-pages/Sheet';
import { textAction } from '@/features/tab-pages/textStyles';

/**
 * The haptic tuning lab. Development builds only: YouScreen reaches this file through a require
 * that is behind `__DEV__`, so no store build contains it, and it has no place in the copy deck.
 *
 * One button per cue, to be judged by hand on real phones (a Pixel on API 34 or later, a Samsung or
 * Xiaomi on API 30 to 33, a phone on API 28 or 29) before the haptic score is trusted. A cue that
 * cannot be felt cleanly is cut in src/design/haptics.ts, and the verdicts are recorded in docs/
 * with the phone's make and API level and nothing else. Buttons go through cue(), so the budget
 * applies as it does in the app: press them a beat apart.
 */
const CUES: readonly { name: Cue; says: string }[] = [
  { name: 'tick', says: 'A choice, a tab, a card turned' },
  { name: 'fine', says: 'One detent of a dial' },
  { name: 'on', says: 'A switch goes on' },
  { name: 'off', says: 'A switch goes off' },
  { name: 'commit', says: 'Begin, the practice is held' },
  { name: 'settle', says: 'Coming to rest, with its tail' },
  { name: 'breathIn', says: 'Breathe: in (Vibrator)' },
  { name: 'breathOut', says: 'Breathe: out (Vibrator)' },
  { name: 'moment', says: 'Breathe: where a bell would ring' },
];

export function HapticLab({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const tone = useTone();
  return (
    <Sheet visible={visible} onClose={onClose} testID="haptic-lab">
      <SheetTitle>Haptic lab</SheetTitle>
      <SheetText soft>{`${Platform.OS} · API ${Platform.Version}`}</SheetText>
      <View style={styles.list}>
        {CUES.map(({ name, says }) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={name}
            onPress={() => cue(name)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <EchoText variant="bodyM" style={[textAction, { color: tone.ink }]}>
              {name}
            </EchoText>
            <EchoText variant="bodyM" style={[textAction, styles.says, { color: tone.inkSoft }]}>
              {says}
            </EchoText>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={({ pressed }) => [styles.row, styles.close, pressed && styles.pressed]}
      >
        <EchoText variant="bodyM" style={[textAction, { color: tone.ink }]}>
          Close
        </EchoText>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: tokens.space[4] },
  row: {
    minHeight: tokens.size.tapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
  },
  says: { flex: 1, textAlign: 'right' },
  close: { justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
