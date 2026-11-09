import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type Props = PropsWithChildren<{ fade: number; style?: StyleProp<ViewStyle> }>;

/** The web has no native mask view, so the browser's own CSS mask does the same job. */
export function ReadingFade({ fade, style, children }: Props) {
  const mask = `linear-gradient(to bottom, transparent 0px, #000 ${fade}px, #000 calc(100% - ${fade}px), transparent 100%)`;
  return (
    <View style={[style, { maskImage: mask, WebkitMaskImage: mask } as unknown as ViewStyle]}>
      {children}
    </View>
  );
}
