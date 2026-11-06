import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { EchoWordmark } from './EchoWordmark';
import { Icon } from './Icon';
import { ProgressSegments } from './ProgressSegments';

type Props = { step: number; onBack?: () => void };

export function OnboardingHeader({ step, onBack }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <View style={styles.center} pointerEvents="none">
        <EchoWordmark />
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
      <ProgressSegments step={step} />
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
