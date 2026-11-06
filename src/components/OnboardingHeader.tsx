import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { EchoWordmark } from './EchoWordmark';
import { Icon } from './Icon';
import { ProgressSegments } from './ProgressSegments';

// The wordmark's width at the reference size, measured. It is read again from layout, so a larger
// text size keeps its clearance too.
const WORDMARK_WIDTH = 105;
// The least air between the wordmark and the progress. The goldens leave about 29 pt at 393 pt wide.
const MIN_GAP = 12;

type Props = { step: number; onBack?: () => void };

export function OnboardingHeader({ step, onBack }: Props) {
  const { colors } = useTheme();
  const { width, gutter } = useLayout();
  const [wordmark, setWordmark] = useState(WORDMARK_WIDTH);
  // The wordmark stays centred. The progress sits to its right, so it can take half the row less half
  // the wordmark, less the gap. On a 320 pt phone that is about 76 pt, and the segments shrink to it.
  const progressRoom = (width - gutter * 2) / 2 - wordmark / 2 - MIN_GAP;
  return (
    <View style={styles.root}>
      <View style={styles.center} pointerEvents="none">
        <View onLayout={(event) => setWordmark(Math.ceil(event.nativeEvent.layout.width))}>
          <EchoWordmark />
        </View>
      </View>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={4}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="arrow-left" size={22} color={colors.textPrimary} />
        </Pressable>
      ) : (
        <View style={styles.back} />
      )}
      <ProgressSegments step={step} maxWidth={progressRoom} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: tokens.size.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: { position: 'absolute', left: 0, right: 0, top: 6, alignItems: 'center' },
  back: {
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    justifyContent: 'center',
    marginLeft: -5,
  },
});
