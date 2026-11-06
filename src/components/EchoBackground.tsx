import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { backgroundColours, backgroundSources } from '@/design/generated/backgrounds';
import { useTheme } from '@/design/theme';
import type { ScreenId } from '@/features/onboarding/flow';

/**
 * The art-directed plate for a screen. Plates are fully graded: per their export contract they are
 * centred, drawn with cover, and never tinted, overlaid, or blended at runtime.
 */
export function EchoBackground({ screen }: { screen: ScreenId }) {
  const { name } = useTheme();
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: backgroundColours[name][screen] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Image
        source={backgroundSources[name][screen]}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        transition={0}
      />
    </View>
  );
}
