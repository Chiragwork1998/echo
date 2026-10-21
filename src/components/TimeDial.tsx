import { useMemo, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { PrimaryCTA } from './PrimaryCTA';
import { GlassCard } from './GlassCard';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import { REMINDER_GRANULARITY_MINUTES } from '@/state/onboardingSelections';

export const TIME_DIAL = { min: 248, max: 292, handle: 22, inset: 18 } as const;

/**
 * Reference ratio from the golden rhythm plate: the dial spans 63% of the
 * viewport, so 393 pt wide resolves to the 248 pt floor and the step, the
 * presets, the toggle and the footer all fit inside one 393 x 852 frame.
 */
const DIAL_WIDTH_RATIO = 0.632;

const MINUTES_PER_DAY = 24 * 60;

export function parseTimeToMinutes(localTime: string): number {
  const [hours = '0', minutes = '0'] = localTime.split(':');
  const total = Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10);
  return Number.isFinite(total) ? ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY : 0;
}

export function formatMinutesToTime(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = `${Math.floor(wrapped / 60)}`.padStart(2, '0');
  const mins = `${wrapped % 60}`.padStart(2, '0');
  return `${hours}:${mins}`;
}

/** Snaps to 5-minute increments and wraps at midnight. */
export function snapMinutes(minutes: number): number {
  const stepped = Math.round(minutes / REMINDER_GRANULARITY_MINUTES) * REMINDER_GRANULARITY_MINUTES;
  return ((stepped % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function polar(center: number, radius: number, minutes: number) {
  const angle = (minutes / MINUTES_PER_DAY) * 360 - 90;
  const radians = (angle * Math.PI) / 180;
  return { x: center + radius * Math.cos(radians), y: center + radius * Math.sin(radians) };
}

type TimeDialProps = {
  localTime: string;
  onChange: (localTime: string) => void;
};

/** Circular 24-hour dial: drag the handle, or tap the time for the picker. */
export function TimeDial({ localTime, onChange }: TimeDialProps) {
  const { width } = useWindowDimensions();
  const { theme } = useEchoTheme();
  const [pickerOpen, setPickerOpen] = useState(false);

  const size = Math.min(TIME_DIAL.max, Math.max(TIME_DIAL.min, Math.round(width * DIAL_WIDTH_RATIO)));
  const center = size / 2;
  const radius = center - TIME_DIAL.inset;
  const minutes = parseTimeToMinutes(localTime);
  const handle = polar(center, radius, minutes);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const dx = locationX - center;
          const dy = locationY - center;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          onChange(formatMinutesToTime(snapMinutes(((angle + 90 + 360) % 360) / 360 * MINUTES_PER_DAY)));
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          const dx = locationX - center;
          const dy = locationY - center;
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          onChange(formatMinutesToTime(snapMinutes(((angle + 90 + 360) % 360) / 360 * MINUTES_PER_DAY)));
        },
      }),
    [center, onChange],
  );

  const ticks = Array.from({ length: 24 }, (_, hour) => {
    const point = polar(center, radius, hour * 60);
    const inner = polar(center, radius - (hour % 6 === 0 ? 10 : 6), hour * 60);
    return { hour, inner, point };
  });

  const arcSweep = minutes > 0 ? 1 : 0;
  const arcEnd = polar(center, radius, minutes);
  const arcPath = `M ${center} ${center - radius} A ${radius} ${radius} 0 ${minutes > 720 ? 1 : 0} ${arcSweep} ${arcEnd.x} ${arcEnd.y}`;

  const shift = (delta: number) => onChange(formatMinutesToTime(snapMinutes(minutes + delta)));

  return (
    <View style={styles.wrap}>
      <View
        {...responder.panHandlers}
        accessibilityLabel="Daily time dial"
        accessibilityRole="adjustable"
        accessibilityValue={{ text: localTime }}
        style={{ width: size, height: size }}
      >
        <Svg height={size} width={size}>
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke="rgba(255,249,239,0.22)"
            strokeWidth={1}
          />
          {ticks.map((tick) => (
            <Line
              key={tick.hour}
              stroke="rgba(255,249,239,0.34)"
              strokeLinecap="round"
              strokeWidth={1}
              x1={tick.inner.x}
              x2={tick.point.x}
              y1={tick.inner.y}
              y2={tick.point.y}
            />
          ))}
          <Path d={arcPath} fill="none" stroke={theme.color.accentWarm} strokeWidth={2} />
          <Circle
            cx={handle.x}
            cy={handle.y}
            fill={theme.color.surfacePrimary}
            r={TIME_DIAL.handle / 2}
            stroke={theme.color.accentWarm}
            strokeWidth={1.5}
          />
        </Svg>
      </View>

      <Pressable
        accessibilityActions={[
          { label: 'Later by five minutes', name: 'increment' },
          { label: 'Earlier by five minutes', name: 'decrement' },
        ]}
        accessibilityLabel="Reminder time"
        accessibilityRole="button"
        accessibilityValue={{ text: localTime }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') {
            shift(REMINDER_GRANULARITY_MINUTES);
          } else if (event.nativeEvent.actionName === 'decrement') {
            shift(-REMINDER_GRANULARITY_MINUTES);
          }
        }}
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [styles.timeTarget, pressed && styles.pressed]}
      >
        <Text style={[styles.time, { color: theme.color.textPrimary }]}>{localTime}</Text>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
        transparent
        visible={pickerOpen}
      >
        <View style={styles.backdrop}>
          <GlassCard padding={tokens.space[24]} style={styles.picker} variant="strong">
            <Text style={[styles.pickerTitle, { color: theme.color.textPrimary }]}>Set your time</Text>
            <View style={styles.stepperRow}>
              <Text style={[styles.stepperLabel, { color: theme.color.textSecondary }]}>Hour</Text>
              <View style={styles.stepperControls}>
                <Stepper
                  accessibilityLabel="Earlier by one hour"
                  label="−"
                  onPress={() => shift(-60)}
                />
                <Text style={[styles.stepperValue, { color: theme.color.textPrimary }]}>
                  {`${Math.floor(minutes / 60)}`.padStart(2, '0')}
                </Text>
                <Stepper accessibilityLabel="Later by one hour" label="+" onPress={() => shift(60)} />
              </View>
            </View>
            <View style={styles.stepperRow}>
              <Text style={[styles.stepperLabel, { color: theme.color.textSecondary }]}>
                Minutes
              </Text>
              <View style={styles.stepperControls}>
                <Stepper
                  accessibilityLabel="Earlier by five minutes"
                  label="−"
                  onPress={() => shift(-REMINDER_GRANULARITY_MINUTES)}
                />
                <Text style={[styles.stepperValue, { color: theme.color.textPrimary }]}>
                  {`${minutes % 60}`.padStart(2, '0')}
                </Text>
                <Stepper
                  accessibilityLabel="Later by five minutes"
                  label="+"
                  onPress={() => shift(REMINDER_GRANULARITY_MINUTES)}
                />
              </View>
            </View>
            <PrimaryCTA
              label="Done"
              onPress={() => setPickerOpen(false)}
              style={styles.pickerCta}
            />
          </GlassCard>
        </View>
      </Modal>
    </View>
  );
}

function Stepper({
  accessibilityLabel,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useEchoTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepperButton,
        { borderColor: theme.color.borderGlass },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.stepperButtonLabel, { color: theme.color.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  timeTarget: { minHeight: tokens.size.tapTarget, justifyContent: 'center', marginTop: tokens.space[4] },
  pressed: { opacity: 0.7 },
  time: {
    ...tokens.type.display,
    fontSize: 40,
    letterSpacing: 0.2,
    lineHeight: 46,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space[24],
    backgroundColor: 'rgba(2,10,20,0.62)',
  },
  picker: { width: '100%', maxWidth: 345 },
  pickerTitle: {
    ...tokens.type.display,
    fontSize: tokens.typography.displayM.size - 6,
    lineHeight: tokens.typography.displayM.lineHeight - 6,
  },
  stepperRow: {
    marginTop: tokens.space[20],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: tokens.size.tapTarget,
  },
  stepperLabel: {
    ...tokens.type.ui,
    fontSize: tokens.typography.bodyM.size,
    letterSpacing: tokens.typography.bodyM.tracking,
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[16] },
  stepperButton: {
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    borderRadius: tokens.size.tapTarget / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonLabel: {
    ...tokens.type.uiMedium,
    fontSize: 22,
    lineHeight: 26,
  },
  stepperValue: {
    minWidth: 44,
    textAlign: 'center',
    ...tokens.type.uiMedium,
    fontSize: 26,
    letterSpacing: 0.2,
  },
  pickerCta: { alignSelf: 'center', marginTop: tokens.space[24] },
});
