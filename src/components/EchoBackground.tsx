import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';

type EchoBackgroundProps = {
  source: ImageSourcePropType;
  fallbackColor: string;
};

export function EchoBackground({ source, fallbackColor }: EchoBackgroundProps) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackColor }]}>
      <Image accessibilityIgnoresInvertColors accessibilityLabel="" source={source} resizeMode="cover" style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({ image: { width: '100%', height: '100%' } });
