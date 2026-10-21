import { StyleSheet, Text, View } from 'react-native';

import { EchoIcon } from './EchoIcon';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';
import type { RhythmDay } from '@/state/journal';

/** Seven days of cairns; filled markers are completed days. */
export function WeekRhythm({ days }: { days: readonly RhythmDay[] }) {
  const { theme } = useEchoTheme();

  return (
    <View
      accessibilityLabel={`${days.filter((day) => day.completed).length} of ${days.length} days completed this week`}
      style={styles.row}
    >
      {days.map((day) => (
        <View
          accessibilityLabel={`${day.weekdayLabel}: ${day.completed ? 'completed' : 'not yet'}`}
          key={day.date}
          style={styles.day}
        >
          <EchoIcon
            color={day.completed ? theme.color.accentWarm : theme.color.textSecondary}
            name={day.completed ? 'cairn-filled' : 'cairn-outline'}
            opacity={day.completed ? 1 : 0.7}
            size={26}
          />
          <Text
            style={[
              styles.label,
              {
                color: day.isToday ? theme.color.textPrimary : theme.color.textSecondary,
              },
              day.isToday && styles.labelToday,
            ]}
          >
            {day.weekdayLabel}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { flex: 1, alignItems: 'center', gap: tokens.space[4], minHeight: tokens.size.tapTarget },
  label: {
    ...tokens.type.ui,
    fontSize: 11,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: 14,
  },
  labelToday: { ...tokens.type.uiMedium },
});
