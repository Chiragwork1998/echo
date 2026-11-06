import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { GlassBlur } from '@/components/GlassCard';
import { tokens } from '@/design/tokens';

import { useTone } from './tone';

function useReduceTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

type Props = PropsWithChildren<{
  radius: number;
  fill: string;
  edge: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>;

/**
 * Frosted glass in either theme's tone: the plate blurred behind a tinted fill and a hairline edge.
 * Falls back to a more opaque fill when the person has asked for less transparency.
 */
export function Glass({ radius, fill, edge, style, contentStyle, children }: Props) {
  const tone = useTone();
  const reduced = useReduceTransparency();
  return (
    <View style={[{ borderRadius: radius, boxShadow: tokens.shadow.glass }, style]}>
      <View style={[styles.clip, { borderRadius: radius, borderColor: edge }]}>
        {!reduced && <GlassBlur tint={tone.tint} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: reduced ? tone.sheet : fill }]} />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', borderWidth: 1 },
});
