import { View, type StyleProp, type TextStyle } from 'react-native';

import type { ThemeColors, TypeVariant } from '@/design/tokens';

import { EchoText } from './EchoText';

type Props = {
  text: string;
  /** Space between letters, in points. */
  tracking: number;
  variant: TypeVariant;
  color?: keyof ThemeColors;
  serif?: boolean;
  style?: StyleProp<TextStyle>;
};

/**
 * Widely tracked display text. Android splits letterSpacing either side of each glyph and iOS adds
 * it after, so a tracked word sits off-centre on one or the other. Placing each letter individually
 * looks identical on every platform. Use for short single words, such as the wordmark.
 */
export function TrackedText({ text, tracking, variant, color, serif, style }: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: tracking }}>
      {text.split('').map((letter, index) => (
        <EchoText
          key={`${letter}${index}`}
          variant={variant}
          color={color}
          serif={serif}
          style={[style, { letterSpacing: 0 }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {letter}
        </EchoText>
      ))}
    </View>
  );
}
