import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentType, PropsWithChildren, ReactElement } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

// The package still types itself as a class component, which React 19's JSX typing rejects.
const Mask = MaskedView as unknown as ComponentType<
  PropsWithChildren<{ style?: StyleProp<ViewStyle>; maskElement: ReactElement }>
>;

type Props = PropsWithChildren<{
  /** How far down the top edge takes to become fully visible. */
  fade: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Fades what is inside to nothing at the top edge, so earlier lines of writing melt into the sky
 * instead of being cut. The mask is alpha only: the photograph behind is never touched.
 */
export function FadeEdge({ fade, style, children }: Props) {
  return (
    <Mask
      style={style}
      maskElement={
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)']} style={{ height: fade }} />
          <View style={styles.solid} />
        </View>
      }
    >
      {children}
    </Mask>
  );
}

const styles = StyleSheet.create({ solid: { flex: 1, backgroundColor: '#000' } });
