import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { tokens } from '@/design/tokens';

type OnboardingHeaderProps = {
  currentStep: number;
  onBack: () => void;
};

const TOTAL_STEPS = 8;

export function OnboardingHeader({ currentStep, onBack }: OnboardingHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Svg height={22} viewBox="0 0 22 22" width={22}>
          <Path
            d="M13.4 3.8 6.4 11l7 7.2"
            fill="none"
            stroke="#FFF9EF"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
          />
        </Svg>
      </Pressable>
      <View pointerEvents="none" style={styles.wordmarkWrap}>
        <Text style={styles.wordmark}>ECHO</Text>
        <View style={styles.rule} />
      </View>
      <View
        accessibilityLabel={`Step ${currentStep} of ${TOTAL_STEPS}`}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: TOTAL_STEPS, min: 1, now: currentStep }}
        style={styles.progressWrap}
      >
        <Text style={styles.progressLabel}>
          {currentStep}/{TOTAL_STEPS}
        </Text>
        <View style={styles.progressTrack}>
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <View key={index} style={[styles.segment, index < currentStep && styles.segmentActive]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: 12,
    height: 62,
    paddingHorizontal: tokens.layout.gutter,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  back: {
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    marginLeft: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.65 },
  wordmarkWrap: { position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' },
  wordmark: {
    color: '#FFF9EF',
    fontFamily: tokens.typography.displayFamily,
    fontSize: tokens.typography.wordmark.size,
    letterSpacing: tokens.typography.wordmark.tracking,
    lineHeight: tokens.typography.wordmark.lineHeight,
    marginLeft: tokens.typography.wordmark.tracking,
  },
  rule: { width: 18, height: 1, marginTop: 4, backgroundColor: '#FFF9EF', opacity: 0.78 },
  progressWrap: { alignItems: 'flex-end', paddingTop: 6 },
  progressLabel: {
    color: '#FFF9EF',
    fontFamily: tokens.typography.uiFamily,
    fontSize: 12,
    letterSpacing: 0.4,
    lineHeight: 15,
    marginBottom: 5,
    opacity: 0.88,
  },
  progressTrack: { flexDirection: 'row', gap: 4 },
  segment: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,249,239,0.28)' },
  segmentActive: { backgroundColor: '#FFF9EF' },
});
