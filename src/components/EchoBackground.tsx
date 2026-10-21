import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';

type EchoBackgroundProps = {
  source: ImageSourcePropType;
  fallbackColor: string;
  /** Deprecated compatibility input. Production plates are always centred. */
  focalPoint?: { x: number; y: number };
};

/**
 * Full-bleed 1290 × 2796 production plate. The validated export contract
 * requires a centred aspect-fill with no independent focal adjustment.
 */
export function EchoBackground({ source, fallbackColor }: EchoBackgroundProps) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackColor }]}>
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel=""
        source={source}
        resizeMode="cover"
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({ image: { width: '100%', height: '100%' } });
