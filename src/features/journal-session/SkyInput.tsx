import { useState, type ComponentRef, type RefObject } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { useTheme } from '@/design/theme';

import { ArrivalFade } from './ArrivalFade';
import { Beacon } from './Beacon';
import { FadeEdge } from './FadeEdge';
import { CARET, WRITING, useSkyInk } from './sky';

type Props = {
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  value: string;
  /** What a screen reader calls the field. */
  label: string;
  editable: boolean;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** The area the writing lives in, over the sky. */
  frame: { top: number; height: number; fade: number };
  /** Show the soft caret where the next word will land. */
  caret: boolean;
  focused: boolean;
  /** Writing: touches reach the words. Speaking: they pass through to the scenery beneath. */
  interactive: boolean;
  /** Counts the times spoken words have landed, so they settle in rather than jump. */
  arrival?: number;
};

const FONT = 'CormorantGaramond_500Medium';

/**
 * Words written straight onto the sky: no box, no border, no glass, nothing behind them. Earlier
 * lines dissolve at the top edge as the writing grows, and the newest line stays in view.
 */
export function SkyInput({
  inputRef,
  value,
  label,
  editable,
  onChangeText,
  onFocus,
  onBlur,
  frame,
  caret,
  focused,
  interactive,
  arrival = 0,
}: Props) {
  const { name } = useTheme();
  const ink = useSkyInk();
  // Where the last line ends while the field is not focused, for the caret that waits there.
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const textStyle = {
    fontFamily: FONT,
    fontSize: WRITING.size,
    lineHeight: WRITING.line,
    letterSpacing: WRITING.tracking,
  };
  const inset = { paddingTop: frame.fade, paddingHorizontal: WRITING.side };

  const empty = value.length === 0;
  const lineOffset = (WRITING.line - CARET.height) / 2;
  const at = empty ? { x: 0, y: 0 } : end;
  // A caret past the bottom of the sky would sit where no one can see the words it follows.
  const fits = at !== null && at.y + WRITING.line <= frame.height - frame.fade;

  return (
    <ArrivalFade
      arrival={arrival}
      pointerEvents={interactive ? 'box-none' : 'none'}
      style={[styles.area, { top: frame.top, height: frame.height }]}
    >
      <FadeEdge fade={frame.fade} style={styles.fill}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          editable={editable}
          multiline
          scrollEnabled
          textAlignVertical="top"
          accessibilityLabel={label}
          // Autofill and suggestion stores sit outside encryption (docs/DATA_CONTRACT.md).
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          keyboardAppearance={name === 'night' ? 'dark' : 'light'}
          selectionColor={ink.glow}
          cursorColor={ink.glow}
          underlineColorAndroid="transparent"
          maxFontSizeMultiplier={2}
          style={[styles.input, inset, textStyle, { color: ink.text }, ink.shadow]}
        />
      </FadeEdge>
      {!focused && !empty && (
        // Never seen: it only tells us where the last line ends, with the same type and width.
        <Text
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          maxFontSizeMultiplier={2}
          onTextLayout={(event) => {
            const last = event.nativeEvent.lines.at(-1);
            if (last) setEnd({ x: last.x + last.width, y: last.y });
          }}
          style={[styles.mirror, inset, textStyle]}
        >
          {value}
        </Text>
      )}
      <Beacon
        kind="caret"
        visible={caret && fits}
        x={WRITING.side + (at?.x ?? 0) + 1}
        y={frame.fade + (at?.y ?? 0) + lineOffset}
      />
    </ArrivalFade>
  );
}

const styles = StyleSheet.create({
  area: { position: 'absolute', left: 0, right: 0 },
  fill: { flex: 1 },
  input: {
    flex: 1,
    paddingBottom: 12,
    // Web draws a focus outline over the sky otherwise.
    outlineWidth: 0,
    outlineColor: 'transparent',
  },
  mirror: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0, paddingBottom: 12 },
});
