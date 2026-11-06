import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { Icon } from '@/components/Icon';
import { TrackedText } from '@/components/TrackedText';
import { copy } from '@/content/copy';
import { goldenCopy } from '@/content/goldenCopy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import type { Rhythm } from '@/features/journal';

import { homeLabels } from './homeLabels';

const CAIRN_SIZE = 27;
const CAIRN_DONE = '#EBD8BA'; // pale limestone, to match the stone above
const CAIRN_OPEN = 'rgba(217,224,234,0.62)';
const LABEL_SIZE = 9.5;
const TRAIL_INSET = 0.052; // of the row, so the trail stops short of each cairn
const DAYS = 7;

const weekdayName = (localDay: string) => {
  const [year, month, date] = localDay.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).toLocaleDateString(undefined, {
    weekday: 'long',
  });
};

/** THIS WEEK: seven cairns, Monday to Sunday. Filled is done, outlined is still to come. */
export function WeekRhythm({ rhythm, loading }: { rhythm: Rhythm; loading: boolean }) {
  const { colors } = useTheme();
  const { accessibleLayout } = useLayout();
  const { week, weekReflections } = rhythm;
  const shown = week.length === DAYS ? week : [];

  return (
    <View style={styles.root}>
      <View style={[styles.heading, accessibleLayout && styles.headingStacked]}>
        <EchoText variant="label" style={styles.eyebrow} maxFontSizeMultiplier={1.3}>
          {copy.home.thisWeek.toUpperCase()}
        </EchoText>
        {!loading && weekReflections > 0 && (
          <EchoText
            variant="caption"
            color="textSecondary"
            align={accessibleLayout ? 'left' : 'right'}
            style={styles.count}
          >
            {goldenCopy.nightRhythm(weekReflections)}
          </EchoText>
        )}
      </View>

      <View style={styles.days} accessibilityRole="list" accessibilityLabel={homeLabels.weekRhythm}>
        <Svg style={styles.trail} width="100%" height={CAIRN_SIZE} pointerEvents="none">
          {shown.slice(0, -1).map(({ day, completed }, i) => (
            <Line
              key={day}
              x1={`${((i + 0.5) / DAYS + TRAIL_INSET) * 100}%`}
              x2={`${((i + 1.5) / DAYS - TRAIL_INSET) * 100}%`}
              y1={CAIRN_SIZE / 2 + 3}
              y2={CAIRN_SIZE / 2 + 3}
              stroke={colors.textSecondary}
              strokeOpacity={completed ? 0.55 : 0.3}
              strokeWidth={StyleSheet.hairlineWidth * 1.4}
              strokeDasharray={completed ? '3 3' : undefined}
            />
          ))}
        </Svg>
        {shown.map(({ day, weekday, completed, isToday }) => (
          <View
            key={day}
            style={styles.day}
            accessible
            accessibilityRole="text"
            accessibilityLabel={[
              weekdayName(day),
              completed ? homeLabels.completed : null,
              isToday ? copy.home.tabs[0] : null,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            <Icon
              name={completed ? 'cairn-filled' : 'cairn-outline'}
              size={CAIRN_SIZE}
              color={completed ? CAIRN_DONE : CAIRN_OPEN}
            />
            <TrackedText
              text={weekday.toUpperCase()}
              tracking={1.9}
              variant="caption"
              color={completed ? 'textPrimary' : 'textSecondary'}
              style={[styles.dayLabel, !completed && styles.dayLabelOpen]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  eyebrow: { fontSize: 9.5, lineHeight: 13, letterSpacing: 1.9, opacity: 0.92, flexShrink: 0 },
  count: { flexShrink: 1, fontSize: 10.5, lineHeight: 14, letterSpacing: 0, opacity: 0.94 },
  days: { flexDirection: 'row' },
  trail: { position: 'absolute', left: 0, right: 0, top: 0 },
  day: { flex: 1, alignItems: 'center', gap: 5 },
  dayLabel: { fontSize: LABEL_SIZE, lineHeight: 14 },
  dayLabelOpen: { opacity: 0.6 },
});
