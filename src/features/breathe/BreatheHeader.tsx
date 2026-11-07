import { Pressable, StyleSheet, View } from 'react-native';

import { EchoWordmark } from '@/components/EchoWordmark';
import { Icon } from '@/components/Icon';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import { breatheCopy } from './breatheCopy';

/** The onboarding header's back arrow and wordmark, with no progress: Breathe is not a journey. */
export function BreatheHeader({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <View style={styles.center} pointerEvents="none">
        <EchoWordmark />
      </View>
      <Pressable
        onPress={onBack}
        hitSlop={4}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel={breatheCopy.back}
        testID="breathe-back"
      >
        <Icon name="arrow-left" size={22} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: tokens.size.headerHeight, flexDirection: 'row', alignItems: 'center' },
  center: { position: 'absolute', left: 0, right: 0, top: 6, alignItems: 'center' },
  back: {
    width: tokens.size.tapTarget,
    height: tokens.size.tapTarget,
    justifyContent: 'center',
    marginLeft: -5,
  },
});
