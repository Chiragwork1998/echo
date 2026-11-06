import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';

import { EchoText } from './EchoText';

// Measured from the goldens. The spec's 18 pt segments cannot fit beside the centred wordmark
// (docs/SPEC_CONFLICTS.md, C-02).
const SEGMENT = { width: 10.5, height: 3, gap: 1.5 };
const INACTIVE_OPACITY = 0.28;

export function ProgressSegments({ step, total = 8 }: { step: number; total?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}
    >
      <EchoText variant="caption" color="textSecondary" style={styles.count}>
        {`${step}/${total}`}
      </EchoText>
      <View style={styles.row}>
        {Array.from({ length: total }, (_, i) => (
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
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 8, height: SEGMENT.height },
  count: {
    position: 'absolute',
    right: 0,
    bottom: 8,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1,
    opacity: 0.8,
  },
  row: { flexDirection: 'row', gap: SEGMENT.gap },
  segment: { width: SEGMENT.width, height: SEGMENT.height, borderRadius: SEGMENT.height / 2 },
});
