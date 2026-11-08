import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { Icon, type IconName } from '@/components/Icon';
import { copy } from '@/content/copy';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import type { ReminderPreset } from '@/state/onboarding';

import { Glass } from './Glass';
import { useTone } from './tone';

const [MORNING, EVENING, BEFORE_SLEEP] = copy.rhythm.presets;
export const PRESETS: readonly {
  value: ReminderPreset;
  label: string;
  icon: IconName;
  minutes: number;
}[] = [
  { value: 'morning', label: MORNING, icon: 'sunrise', minutes: 8 * 60 },
  { value: 'evening', label: EVENING, icon: 'sun', minutes: 18 * 60 + 30 },
  { value: 'before_sleep', label: BEFORE_SLEEP, icon: 'moon', minutes: 21 * 60 + 30 },
];

// Measured from the golden.
const CARD_HEIGHT = 66.5;
const ROW_GAP = 11;
const ICON = 22;
const BADGE = 16;
const SELECTED_EDGE = 1.5;
const LABEL = { fontSize: 11.6, lineHeight: 15 };
const SPRING = { ...tokens.motion.spring, reduceMotion: ReduceMotion.System };
// A press tints the card from inside, as a veil of its own ink (cream on Night, ink on Day). The card
// itself is never made translucent: a frosted blur under a faded ancestor turns see-through.
const PRESS_VEIL = 0.08;

type CardProps = {
  label: string;
  icon: IconName;
  selected: boolean;
  stacked: boolean;
  onPress: () => void;
};

function PresetCard({ label, icon, selected, stacked, onPress }: CardProps) {
  const tone = useTone();
  const { colors } = useTheme();
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.set(
      selected
        ? withSpring(1, SPRING)
        : withTiming(0, { duration: tokens.motion.fast, reduceMotion: ReduceMotion.System }),
    );
  }, [selected, progress]);

  const press = useSharedValue(0);
  const feel = (to: number) =>
    press.set(
      withTiming(to, { duration: tokens.motion.instant, reduceMotion: ReduceMotion.Never }),
    );
  const highlight = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const veil = useAnimatedStyle(() => ({ opacity: PRESS_VEIL * press.get() }));
  const badge = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: 0.6 + 0.4 * progress.get() }],
  }));

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      onPressIn={() => feel(1)}
      onPressOut={() => feel(0)}
      style={styles.pressable}
    >
      <Glass
        radius={tokens.radius.medium}
        fill={tone.card}
        edge={tone.edge}
        style={stacked ? undefined : styles.fill}
        contentStyle={[styles.card, stacked && styles.stacked]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.highlight,
            { backgroundColor: tone.cardSelected, borderColor: tone.gold },
            highlight,
          ]}
        />
        <Animated.View
          testID="preset-press-veil"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tone.ink }, veil]}
        />
        <View>
          <Icon name={icon} size={ICON} color={tone.ink} />
        </View>
        <EchoText variant="bodyM" style={[LABEL, { color: tone.ink }]} numberOfLines={2}>
          {label}
        </EchoText>
        <Animated.View pointerEvents="none" style={[styles.badge, badge]}>
          <Svg width={BADGE} height={BADGE} viewBox="0 0 16 16">
            <Circle cx={8} cy={8} r={8} fill={tone.gold} />
            <Path
              d="M4.6 8.3l2.3 2.3 4.5-4.8"
              stroke={colors.textInk}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      </Glass>
    </Pressable>
  );
}

type Props = {
  selected?: ReminderPreset;
  onSelect: (preset: ReminderPreset) => void;
  /** One card per row, for large text. */
  stacked?: boolean;
};

/** Morning, Evening and Before sleep. The chosen card gains a gold edge and a check, not colour alone. */
export function PresetCards({ selected, onSelect, stacked = false }: Props) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.group, stacked ? styles.column : styles.row]}
    >
      {PRESETS.map(({ value, label, icon }) => (
        <PresetCard
          key={value}
          label={label}
          icon={icon}
          selected={value === selected}
          stacked={stacked}
          onPress={() => onSelect(value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: ROW_GAP, alignSelf: 'stretch' },
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  pressable: { flex: 1 },
  fill: { flex: 1 },
  card: {
    minHeight: CARD_HEIGHT - 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: tokens.space[8],
    paddingTop: 2,
  },
  stacked: {
    minHeight: tokens.size.primaryButtonHeight,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: tokens.space[16],
    paddingHorizontal: tokens.space[16],
  },
  highlight: { borderRadius: tokens.radius.medium, borderWidth: SELECTED_EDGE },
  badge: { position: 'absolute', top: 6, right: 6 },
});
