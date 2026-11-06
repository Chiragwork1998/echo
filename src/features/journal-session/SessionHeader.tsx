import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { EchoWordmark } from '@/components/EchoWordmark';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { HEADER_HEIGHT, PROGRESS, TIMER } from './geometry';
import { TimerRing, type TimerState } from './TimerRing';

const INACTIVE_OPACITY = 0.28;
const TOTAL_STEPS = 8;

/** Progress centred under the wordmark, as First Echo's golden draws it. ProgressSegments cannot. */
function StepProgress({ step }: { step: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${TOTAL_STEPS}`}
      accessibilityValue={{ min: 0, max: TOTAL_STEPS, now: step }}
    >
      <View>
        <EchoText variant="caption" color="textSecondary" style={styles.count}>
          {`${step}/${TOTAL_STEPS}`}
        </EchoText>
        <View style={styles.segments}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View
              key={i}
              style={[
                styles.segment,
                {
                  backgroundColor: colors.surfacePrimary,
                  opacity: i < step ? 1 : INACTIVE_OPACITY,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

type Props = {
  onBack: () => void;
  /** Onboarding step. Omitted for the daily session, which has no progress. */
  step?: number;
  remaining: number;
  timerState: TimerState;
};

/** Back, wordmark and the timer ring, with the onboarding progress beneath the wordmark. */
export function SessionHeader({ onBack, step, remaining, timerState }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <View style={styles.wordmark} pointerEvents="none">
        <EchoWordmark />
      </View>
      <Pressable
        onPress={onBack}
        hitSlop={4}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Icon name="arrow-left" size={22} color={colors.textPrimary} />
      </Pressable>
      {step !== undefined && <StepProgress step={step} />}
      <View style={styles.timer}>
        <TimerRing remaining={remaining} state={timerState} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: HEADER_HEIGHT },
  wordmark: { position: 'absolute', left: 0, right: 0, top: 6, alignItems: 'center' },
  back: {
    position: 'absolute',
    left: -5,
    top: 0,
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    justifyContent: 'center',
  },
  timer: { position: 'absolute', right: TIMER.right, top: TIMER.top },
  progress: { position: 'absolute', left: 0, right: 0, top: PROGRESS.top, alignItems: 'center' },
  segments: { flexDirection: 'row', gap: PROGRESS.gap },
  segment: { width: PROGRESS.width, height: PROGRESS.height, borderRadius: PROGRESS.height / 2 },
  count: {
    position: 'absolute',
    right: 0,
    bottom: PROGRESS.height + 1,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1,
    opacity: 0.8,
  },
});
