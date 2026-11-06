import { BlurTargetView, BlurView } from 'expo-blur';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

type BlurTarget = RefObject<ComponentRef<typeof View> | null>;
const BlurTargetContext = createContext<BlurTarget | null>(null);

/**
 * Android blurs a target view rather than whatever is behind it, so the plate goes in `backdrop` and
 * glass inside `children` shares the target. The target must not contain the BlurView itself.
 */
export function BlurSurface({ backdrop, children }: PropsWithChildren<{ backdrop: ReactNode }>) {
  const target = useRef<ComponentRef<typeof View>>(null);
  return (
    <BlurTargetContext.Provider value={target}>
      <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
        {backdrop}
      </BlurTargetView>
      {children}
    </BlurTargetContext.Provider>
  );
}

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

/** expo-blur maps intensity to radius differently per platform; these match the 24/32 pt tokens. */
const intensityFor = (radius: number) => Math.min(100, Math.round(radius * 2.5));

type Props = PropsWithChildren<{
  strength?: 'regular' | 'strong';
  radius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function GlassCard({ strength = 'regular', radius, style, contentStyle, children }: Props) {
  const { colors } = useTheme();
  const target = useContext(BlurTargetContext);
  const reduceTransparency = useReduceTransparency();
  const strong = strength === 'strong' || reduceTransparency;
  const borderRadius = radius ?? tokens.radius.card;

  return (
    <View style={[{ borderRadius, boxShadow: tokens.shadow.glass }, style]}>
      <View style={[styles.clip, { borderRadius, borderColor: colors.borderGlass }]}>
        {!reduceTransparency && (
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={intensityFor(
              strength === 'strong' ? tokens.blur.glassStrong : tokens.blur.glass,
            )}
            tint="default"
            blurMethod="dimezisBlurView"
            blurTarget={target ?? undefined}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: strong ? colors.surfaceGlassStrong : colors.surfaceGlass },
          ]}
        />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', borderWidth: 1 },
});
