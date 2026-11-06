import { BlurTargetView, BlurView, type BlurTint } from 'expo-blur';
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

/** Backdrop blur tied to the screen's plate. For custom glass shapes that GlassCard cannot express. */
export function GlassBlur({
  radius = tokens.blur.glass,
  tint = 'default',
}: {
  radius?: number;
  tint?: BlurTint;
}) {
  const target = useContext(BlurTargetContext);
  return (
    <BlurView
      style={StyleSheet.absoluteFill}
      intensity={intensityFor(radius)}
      tint={tint}
      blurMethod="dimezisBlurView"
      blurTarget={target ?? undefined}
    />
  );
}

type Props = PropsWithChildren<{
  strength?: 'regular' | 'strong';
  radius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function GlassCard({ strength = 'regular', radius, style, contentStyle, children }: Props) {
  const { colors } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const strong = strength === 'strong' || reduceTransparency;
  const borderRadius = radius ?? tokens.radius.card;

  return (
    <View style={[{ borderRadius, boxShadow: tokens.shadow.glass }, style]}>
      <View style={[styles.clip, { borderRadius, borderColor: colors.borderGlass }]}>
        {!reduceTransparency && (
          <GlassBlur radius={strength === 'strong' ? tokens.blur.glassStrong : tokens.blur.glass} />
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
