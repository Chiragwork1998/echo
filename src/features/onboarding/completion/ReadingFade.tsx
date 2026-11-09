import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentType, PropsWithChildren, ReactElement } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

// The package still types itself as a class component, which React 19's JSX typing rejects.
const Mask = MaskedView as unknown as ComponentType<
  PropsWithChildren<{ style?: StyleProp<ViewStyle>; maskElement: ReactElement }>
>;

const CLEAR = 'rgba(0,0,0,0)';
const WHOLE = 'rgba(0,0,0,1)';

/**
 * Fades what is inside to nothing at its top and bottom edges, so that words scrolling past melt into
 * the glass instead of being cut at a line. The mask is alpha only: the glass behind is never touched,
 * and it is not an ancestor of the glass, whose blur a fading ancestor would lose on Android.
 */
export function ReadingFade({
  fade,
  style,
  children,
}: PropsWithChildren<{ fade: number; style?: StyleProp<ViewStyle> }>) {
  return (
    <Mask
      style={style}
      maskElement={
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={[CLEAR, WHOLE]} style={{ height: fade }} />
          <View style={styles.solid} />
          <LinearGradient colors={[WHOLE, CLEAR]} style={{ height: fade }} />
        </View>
      }
    >
      {children}
    </Mask>
  );
}

const styles = StyleSheet.create({ solid: { flex: 1, backgroundColor: '#000' } });
