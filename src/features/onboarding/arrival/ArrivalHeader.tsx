import { Pressable, StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { TrackedText } from '@/components/TrackedText';
import { copy } from '@/content/copy';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

// This step's header, measured from its golden: the wordmark sits at the left with no rule, the
// progress is centred on the screen, and Skip is at the right. There is no back arrow; the system
// back gesture and button return to Privacy. Offsets are from the top of the 44 pt header band.
const DROP = 6; // this golden sets its header lower than the other steps
const WORDMARK = {
  size: tokens.typography.wordmark.size * 0.875,
  line: tokens.typography.wordmark.lineHeight * 0.875,
  tracking: 7.3,
  top: -2.5 + DROP,
  left: -1.5,
};
// Eight segments in the footprint the golden gives its seven, so six of eight can be filled.
const SEGMENT = { width: 12, height: 3, gap: 2.5 };
const INACTIVE_OPACITY = 0.28;
const COUNT = { size: 10, line: 12, top: 3 + DROP, tracking: 0.4, opacity: 0.85 };
const PROGRESS_TOP = 21.5 + DROP;
const SKIP = { size: 14, line: 18, top: -11.5 + DROP };
const SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.32)',
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
} as const;

type Props = {
  step: number;
  total?: number;
  onSkip: () => void;
  /** Large text: the three parts no longer fit on one line, so the progress drops below. */
  stacked?: boolean;
};

function Progress({ step, total }: { step: number; total: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step }}
    >
      <EchoText
        variant="caption"
        color="textSecondary"
        style={styles.count}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {`${step} / ${total}`}
      </EchoText>
      <View style={styles.segments}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              {
                backgroundColor: colors.surfacePrimary,
                opacity: index < step ? 1 : INACTIVE_OPACITY,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function ArrivalHeader({ step, total = 8, onSkip, stacked = false }: Props) {
  const wordmark = (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={copy.landing.wordmark}
      style={stacked ? undefined : styles.wordmark}
    >
      <TrackedText
        text={copy.landing.wordmark}
        tracking={WORDMARK.tracking}
        variant="wordmark"
        style={{ fontSize: WORDMARK.size, lineHeight: WORDMARK.line }}
      />
    </View>
  );
  const skip = (
    <Pressable
      onPress={onSkip}
      accessibilityRole="button"
      accessibilityLabel={copy.arrival.skip}
      style={[styles.skip, stacked ? styles.skipStacked : styles.skipPinned]}
    >
      <EchoText variant="bodyM" style={[styles.skipText, SHADOW]}>
        {copy.arrival.skip}
      </EchoText>
    </Pressable>
  );

  if (stacked) {
    return (
      <View>
        <View style={styles.row}>
          {wordmark}
          {skip}
        </View>
        <View style={styles.stackedProgress}>
          <Progress step={step} total={total} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.band}>
      {wordmark}
      <View style={styles.centre} pointerEvents="none">
        <Progress step={step} total={total} />
      </View>
      {skip}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { height: tokens.size.headerHeight },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { position: 'absolute', left: WORDMARK.left, top: WORDMARK.top },
  centre: { position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' },
  progress: { alignItems: 'center' },
  count: {
    fontSize: COUNT.size,
    lineHeight: COUNT.line,
    letterSpacing: COUNT.tracking,
    opacity: COUNT.opacity,
    marginTop: COUNT.top,
  },
  segments: {
    flexDirection: 'row',
    gap: SEGMENT.gap,
    marginTop: PROGRESS_TOP - COUNT.top - COUNT.line,
  },
  segment: { width: SEGMENT.width, height: SEGMENT.height, borderRadius: SEGMENT.height / 2 },
  stackedProgress: { alignItems: 'center', marginTop: 4 },
  skip: {
    minWidth: tokens.size.tapTarget,
    minHeight: tokens.size.tapTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  skipPinned: { position: 'absolute', right: 0, top: SKIP.top },
  skipStacked: {},
  skipText: { fontSize: SKIP.size, lineHeight: SKIP.line },
});
