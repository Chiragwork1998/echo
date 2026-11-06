import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { EchoText } from './EchoText';

/** More than any difference between a line as measured and as drawn. */
const SPARE = 24;

/**
 * A short label on a control, which must never lose a word.
 *
 * Android can draw a line in a little less room than it measured. The last word then drops to a
 * second line, and a control sized for one line clips it, so "Write instead" reads "Write". An
 * invisible copy sets the control's size, and the label itself sits over it with room to spare.
 */
export function OneLineLabel({ style, children, ...text }: ComponentProps<typeof EchoText>) {
  return (
    <View>
      <EchoText
        {...text}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[style, styles.sizer]}
      >
        {children}
      </EchoText>
      <EchoText {...text} numberOfLines={1} style={[style, styles.shown]}>
        {children}
      </EchoText>
    </View>
  );
}

const styles = StyleSheet.create({
  sizer: { opacity: 0 },
  shown: { position: 'absolute', top: 0, left: -SPARE, right: -SPARE, textAlign: 'center' },
});
