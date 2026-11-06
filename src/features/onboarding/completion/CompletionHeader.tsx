import { StyleSheet, View } from 'react-native';

import { EchoText } from '@/components/EchoText';
import { TrackedText } from '@/components/TrackedText';
import { copy } from '@/content/copy';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

// Measured from the golden, which sets this header a little differently from the other steps: a
// larger, closer wordmark with a short rule, and the progress as round dots.
const WORDMARK = { size: tokens.typography.wordmark.size, line: 32, tracking: 7.6, top: 5.5 };
const RULE = { width: 20, height: 0.7, top: 11, opacity: 0.85 };
// The golden draws seven dots beside "8/8". Eight are set in the same footprint, so that all eight
// steps are counted.
const DOT = { size: 6, pitch: 8.55 };
const COUNT = { size: 10.7, line: 13, gap: 11.2 };
// On a 320 pt phone the count and dots, at the golden's size, run into the wordmark. Smaller dots and
// a tighter count leave the 13 pt a 360 pt phone has.
const NARROW = { dot: { size: 5, pitch: 6.9 }, countGap: 7 };
const PROGRESS_TOP = 13.5;
const PROGRESS_EDGE = 16; // from the screen's right edge, past the gutter
const INACTIVE_OPACITY = 0.28;

/**
 * Wordmark, and in onboarding the step count and dots. The daily screen has the wordmark alone.
 * Everything sits in the same 44 pt band as the shared header, so the heading below does not move.
 */
export function CompletionHeader({ step, total = 8 }: { step?: number; total?: number }) {
  const { colors } = useTheme();
  const { gutter, narrow } = useLayout();
  const dot = narrow ? NARROW.dot : DOT;
  return (
    <View style={styles.band}>
      <View
        style={styles.wordmark}
        pointerEvents="none"
        accessible
        accessibilityRole="header"
        accessibilityLabel={copy.landing.wordmark}
      >
        <TrackedText
          text={copy.landing.wordmark}
          tracking={WORDMARK.tracking}
          variant="wordmark"
          style={{ fontSize: WORDMARK.size, lineHeight: WORDMARK.line }}
        />
        <View style={[styles.rule, { backgroundColor: colors.textPrimary }]} />
      </View>
      {step !== undefined && (
        <View
          style={[
            styles.progress,
            { right: PROGRESS_EDGE - gutter },
            narrow && { gap: NARROW.countGap },
          ]}
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
            {`${step}/${total}`}
          </EchoText>
          <View style={[styles.dots, { gap: dot.pitch - dot.size }]}>
            {Array.from({ length: total }, (_, index) => (
              <View
                key={index}
                testID="completion-dot"
                style={[
                  styles.dot,
                  {
                    width: dot.size,
                    height: dot.size,
                    borderRadius: dot.size / 2,
                    backgroundColor: colors.surfacePrimary,
                    opacity: index < step ? 1 : INACTIVE_OPACITY,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { height: tokens.size.headerHeight },
  wordmark: { position: 'absolute', left: 0, right: 0, top: WORDMARK.top, alignItems: 'center' },
  rule: { width: RULE.width, height: RULE.height, marginTop: RULE.top, opacity: RULE.opacity },
  progress: {
    position: 'absolute',
    top: PROGRESS_TOP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: COUNT.gap,
  },
  count: { fontSize: COUNT.size, lineHeight: COUNT.line, letterSpacing: 0.3, opacity: 0.9 },
  dots: { flexDirection: 'row', gap: DOT.pitch - DOT.size },
  dot: { width: DOT.size, height: DOT.size, borderRadius: DOT.size / 2 },
});
