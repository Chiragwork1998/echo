import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { Icon } from '@/components/Icon';
import { copy } from '@/content/copy';
import { tokens } from '@/design/tokens';

import { Glass } from './Glass';
import { useTone } from './tone';

// The golden's switch is smaller than the 52 x 30 token, and its row shorter than ToggleRow's 60.
const ROW_HEIGHT = 52.5;
const BELL = 26;
const TRACK = { width: 41, height: 22, pad: 1 };
const KNOB = TRACK.height - TRACK.pad * 2 - 2;
const TRAVEL = TRACK.width - KNOB - TRACK.pad * 2 - 2;

type Props = { value: boolean; onChange: (next: boolean) => void };

/** The Gentle reminder switch. It only records the choice: permission is asked after Set my rhythm. */
export function ReminderRow({ value, onChange }: Props) {
  const tone = useTone();
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.set(
      withSpring(value ? 1 : 0, { ...tokens.motion.spring, reduceMotion: ReduceMotion.System }),
    );
  }, [value, on]);

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: on.get() * TRAVEL }] }));
  const fill = useAnimatedStyle(() => ({ opacity: on.get() }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={copy.rhythm.reminder}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
    >
      <Glass
        radius={tokens.radius.medium}
        fill={tone.card}
        edge={tone.edge}
        contentStyle={styles.row}
      >
        <Icon name="bell" size={BELL} color={tone.ink} />
        <EchoText variant="bodyM" style={[styles.label, { color: tone.ink }]}>
          {copy.rhythm.reminder}
        </EchoText>
        <View style={[styles.track, { borderColor: tone.edge }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tone.track }, fill]} />
          <Animated.View style={[styles.knob, { backgroundColor: tone.knob }, knob]} />
        </View>
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_HEIGHT - 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[12],
    paddingLeft: tokens.space[16],
    paddingRight: 13,
  },
  label: { flex: 1, fontSize: 11.6, lineHeight: 16 },
  track: {
    width: TRACK.width,
    height: TRACK.height,
    borderRadius: TRACK.height / 2,
    borderWidth: 1,
    padding: TRACK.pad,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
});
