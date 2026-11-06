import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/design/theme';
import type { ThemeColors, TypeVariant } from '@/design/tokens';
import { textStyle } from '@/design/typography';

type Props = TextProps & {
  variant: TypeVariant;
  color?: keyof ThemeColors;
  align?: 'left' | 'center' | 'right';
  italic?: boolean;
  serif?: boolean;
};

/** All text goes through here so type always comes from the design tokens. */
export function EchoText({
  variant,
  color = 'textPrimary',
  align,
  italic,
  serif,
  style,
  ...rest
}: Props) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        textStyle(variant, { italic, serif }),
        { color: colors[color], textAlign: align },
        style,
      ]}
    />
  );
}
