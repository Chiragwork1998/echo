import { useEffect, useState, type PropsWithChildren } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { textStyle } from '@/design/typography';

import {
  SURFACE_INSET,
  SURFACE_KEYBOARD_MIN_HEIGHT,
  SURFACE_MIN_HEIGHT,
  SURFACE_RADIUS,
} from './geometry';
import { GlassPanel, useSurfaceInk } from './GlassPanel';
import { sessionCopy } from './sessionCopy';

// The goldens set the placeholder at 14.5 pt, 27 pt in from the edge of the glass.
const INPUT = { size: 14.5, line: 21 };
const PADDING = { top: 18, side: 26, bottom: 40 };
const NOTE = { left: 26, bottom: 12 };

type Props = PropsWithChildren<{
  /** Draft text, shown in Write. Speak puts its own panel in `children` instead. */
  value: string;
  placeholder: string;
  label: string;
  editable: boolean;
  onChangeText: (text: string) => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  /** Speak: hides the field, and the surface holds its children. */
  hideField?: boolean;
  /** The keyboard is up and the surface gives way to the controls above it. */
  squeezed?: boolean;
}>;

/** "Saved on this device": appears after the first save and stays, so autosaving never flickers. */
function SavedNote({ visible }: { visible: boolean }) {
  const { text } = useSurfaceInk();
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.set(
      withTiming(visible ? 1 : 0, {
        duration: tokens.motion.fast,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [opacity, visible]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View pointerEvents="none" style={[styles.note, animated]}>
      <EchoText
        variant="caption"
        style={{ color: text, opacity: 0.7 }}
        accessibilityLiveRegion="polite"
      >
        {visible ? sessionCopy.saved : ' '}
      </EchoText>
    </Animated.View>
  );
}

/** The large glass page. The placeholder is the field's own, so it leaves with the first letter. */
export function WritingSurface({
  value,
  placeholder,
  label,
  editable,
  onChangeText,
  saveState,
  hideField = false,
  squeezed = false,
  children,
}: Props) {
  const { name } = useTheme();
  const { text, muted, shadow } = useSurfaceInk();
  const [everSaved, setEverSaved] = useState(false);
  if (saveState === 'saved' && !everSaved) setEverSaved(true);
  const noteVisible = saveState === 'saved' || (saveState === 'saving' && everSaved);
  const minHeight = squeezed ? SURFACE_KEYBOARD_MIN_HEIGHT : SURFACE_MIN_HEIGHT;

  return (
    <GlassPanel radius={SURFACE_RADIUS} style={[styles.surface, { minHeight }]}>
      {hideField ? (
        children
      ) : (
        <>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            editable={editable}
            multiline
            scrollEnabled
            textAlignVertical="top"
            placeholder={placeholder}
            placeholderTextColor={muted}
            accessibilityLabel={label}
            // Autofill and suggestion stores sit outside encryption (docs/DATA_CONTRACT.md).
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            keyboardAppearance={name === 'night' ? 'dark' : 'light'}
            selectionColor={text}
            style={[styles.input, textStyle('bodyM'), styles.size, { color: text }, shadow]}
          />
          <SavedNote visible={noteVisible} />
        </>
      )}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, marginHorizontal: SURFACE_INSET },
  input: {
    flex: 1,
    paddingTop: PADDING.top,
    paddingHorizontal: PADDING.side,
    paddingBottom: PADDING.bottom,
    // Web draws a focus outline inside the glass otherwise.
    outlineWidth: 0,
    outlineColor: 'transparent',
    // The web draws absolutely positioned glass over an unpositioned field.
    position: 'relative',
  },
  size: { fontSize: INPUT.size, lineHeight: INPUT.line },
  note: { position: 'absolute', left: NOTE.left, bottom: NOTE.bottom },
});
