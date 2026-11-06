import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';

import { SESSION_SECONDS, TIMER, formatClock } from './geometry';
import { sessionCopy } from './sessionCopy';

const TRACK_OPACITY = 0.28;
const COMPLETE_OPACITY = 0.6;

export type TimerState = 'idle' | 'active' | 'complete';

type Props = {
  remaining: number;
  state: TimerState;
  total?: number;
  size?: number;
};

/**
 * The seven-minute ring. Whole at the start, it drains as time passes. At zero it rests as a full,
 * quieter ring: nothing stops and nothing flashes, because the writing is never cut off.
 */
export function TimerRing({ remaining, state, total = SESSION_SECONDS, size = TIMER.size }: Props) {
  const { colors } = useTheme();
  const radius = (size - TIMER.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = state === 'active' ? Math.min(1, Math.max(0, remaining / total)) : 1;
  const clock = formatClock(remaining);
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${sessionCopy.timer} ${clock}`}
      style={[styles.root, { width: size, height: size }]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} accessible={false}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.textPrimary}
          strokeOpacity={TRACK_OPACITY}
          strokeWidth={TIMER.stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.textPrimary}
          strokeOpacity={state === 'complete' ? COMPLETE_OPACITY : 1}
          strokeWidth={TIMER.stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - fraction)}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
          fill="none"
        />
      </Svg>
      <EchoText variant="caption" style={styles.clock} accessibilityElementsHidden>
        {clock}
      </EchoText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  clock: { fontSize: 11, lineHeight: 14, letterSpacing: 0, fontVariant: ['tabular-nums'] },
});
