import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

export const TIMER_RING_SIZE = 52;
const STROKE = 2;
const RADIUS = (TIMER_RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** One seven-minute session fills the ring; the timer never force-stops. */
const SESSION_SECONDS = 7 * 60;

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = `${Math.floor(safe / 60)}`.padStart(2, '0');
  const seconds = `${safe % 60}`.padStart(2, '0');
  return `${minutes}:${seconds}`;
}

type TimerRingProps = { active: boolean; elapsedSeconds: number };

/** 52 pt ring; idle, active and paused are distinguished by fill and label. */
export function TimerRing({ active, elapsedSeconds }: TimerRingProps) {
  const { theme } = useEchoTheme();
  const progress = Math.min(1, elapsedSeconds / SESSION_SECONDS);

  return (
    <View
      accessibilityLabel={`${formatDuration(elapsedSeconds)} elapsed`}
      accessibilityRole="timer"
      style={styles.wrap}
    >
      <Svg height={TIMER_RING_SIZE} width={TIMER_RING_SIZE}>
        <Circle
          cx={TIMER_RING_SIZE / 2}
          cy={TIMER_RING_SIZE / 2}
          fill="none"
          r={RADIUS}
          stroke="rgba(255,249,239,0.28)"
          strokeWidth={STROKE}
        />
        <Circle
          cx={TIMER_RING_SIZE / 2}
          cy={TIMER_RING_SIZE / 2}
          fill="none"
          r={RADIUS}
          stroke={active ? theme.color.accentWarm : theme.color.textSecondary}
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          strokeLinecap="round"
          strokeWidth={STROKE}
        />
      </Svg>
      <Text style={[styles.label, { color: theme.color.textPrimary }]}>
        {formatDuration(elapsedSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: TIMER_RING_SIZE, height: TIMER_RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  label: {
    position: 'absolute',
    ...tokens.type.ui,
    fontSize: 11,
    letterSpacing: tokens.typography.caption.tracking,
  },
});
