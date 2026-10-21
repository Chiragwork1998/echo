import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { HEADER } from '@/design/onboardingLayout';
import { useEchoTheme } from '@/design/ThemeProvider';
import { tokens } from '@/design/tokens';

type OnboardingHeaderProps = {
  currentStep: number;
  onBack: () => void;
  /** Completion disables back navigation. */
  showBack?: boolean;
};

const TOTAL_STEPS = 8;
/** The wordmark's line box sits at the top of the header box, as in the golden. */
const WORDMARK_TOP = HEADER.wordmark.nudgeY;
const RULE_MARGIN_TOP =
  HEADER.height + HEADER.rule.offsetY - WORDMARK_TOP - HEADER.wordmark.lineHeight;
/** Back target is centred on the wordmark's line box, not on the 44 pt box. */
const BACK_TOP = WORDMARK_TOP + HEADER.wordmark.lineHeight / 2 - tokens.size.tapTarget / 2;

export function OnboardingHeader({ currentStep, onBack, showBack = true }: OnboardingHeaderProps) {
  const { name, setSetting } = useEchoTheme();

  return (
    <View style={[styles.header, { marginTop: HEADER.topOffset }]}>
      {showBack ? (
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Svg
            height={HEADER.backGlyph.height}
            viewBox="0 0 10 18"
            width={HEADER.backGlyph.width}
          >
            <Path
              d="M8.6 1.1 1.4 9l7.2 7.9"
              fill="none"
              stroke="#FFF9EF"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={HEADER.backGlyph.strokeWidth}
            />
          </Svg>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel={__DEV__ ? `ECHO. Previewing ${name} theme` : 'ECHO'}
        accessibilityRole="text"
        delayLongPress={350}
        onLongPress={__DEV__ ? () => setSetting(name === 'day' ? 'night' : 'day') : undefined}
        style={styles.wordmarkWrap}
      >
        <Text style={styles.wordmark}>ECHO</Text>
        <View style={styles.rule} />
      </Pressable>
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
            <View
              key={index}
              style={[
                styles.segment,
                index < currentStep && styles.segmentDone,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: HEADER.height,
    justifyContent: 'center',
  },
  back: {
    position: 'absolute',
    top: BACK_TOP,
    left: HEADER.backGlyph.left - (tokens.size.tapTarget - HEADER.backGlyph.width) / 2,
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pressed: { opacity: 0.65 },
  wordmarkWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WORDMARK_TOP,
    alignItems: 'center',
  },
  wordmark: {
    color: '#FFF9EF',
    ...tokens.type.display,
    fontSize: HEADER.wordmark.size,
    letterSpacing: HEADER.wordmark.tracking,
    lineHeight: HEADER.wordmark.lineHeight,
  },
  rule: {
    width: HEADER.rule.width,
    height: HEADER.rule.height,
    marginTop: RULE_MARGIN_TOP,
    backgroundColor: '#FFF9EF',
    opacity: HEADER.rule.opacity,
  },
  progressWrap: {
    position: 'absolute',
    top: HEADER.progress.labelTop,
    right: HEADER.progress.right,
    alignItems: 'flex-end',
  },
  progressLabel: {
    color: '#FFF9EF',
    ...tokens.type.ui,
    fontSize: HEADER.progress.labelSize,
    letterSpacing: tokens.typography.caption.tracking,
    lineHeight: HEADER.progress.labelLineHeight,
    opacity: 0.92,
    textAlign: 'right',
  },
  progressTrack: {
    flexDirection: 'row',
    gap: HEADER.progress.segmentGap,
    marginTop: HEADER.progress.trackGap,
  },
  segment: {
    width: HEADER.progress.segmentWidth,
    height: HEADER.progress.segmentHeight,
    borderRadius: HEADER.progress.segmentHeight / 2,
    backgroundColor: 'rgba(255,249,239,0.30)',
  },
  segmentDone: { backgroundColor: '#FFF9EF' },
});
