import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';

import { EchoText } from './EchoText';

// Measured from the goldens. The spec's 18 pt segments cannot fit beside the centred wordmark
// (docs/SPEC_CONFLICTS.md, C-02).
const SEGMENT = { width: 10.5, height: 3, gap: 1.5 };
const INACTIVE_OPACITY = 0.28;
// Segments never shrink below this, so that a step is still a mark and not a speck.
const MIN_SEGMENT_WIDTH = 3;

type Props = {
  step: number;
  total?: number;
  /**
   * The most width the row may take. The golden's 96 pt row is used whenever it fits; a narrower
   * phone sets the segments a little smaller instead of running into the wordmark.
   */
  maxWidth?: number;
};

export function ProgressSegments({ step, total = 8, maxWidth }: Props) {
  const { colors } = useTheme();
  const gaps = SEGMENT.gap * (total - 1);
  const width =
    maxWidth === undefined
      ? SEGMENT.width
      : Math.max(MIN_SEGMENT_WIDTH, Math.min(SEGMENT.width, (maxWidth - gaps) / total));
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
                width,
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
  segment: { height: SEGMENT.height, borderRadius: SEGMENT.height / 2 },
});
