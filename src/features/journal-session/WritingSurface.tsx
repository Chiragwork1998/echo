import * as Haptics from 'expo-haptics';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { textStyle } from '@/design/typography';
import { useReduceMotion } from '@/design/useReduceMotion';

import {
  SURFACE_INSET,
  SURFACE_KEYBOARD_MIN_HEIGHT,
  SURFACE_MIN_HEIGHT,
  SURFACE_RADIUS,
} from './geometry';
import { ArrivalFade } from './ArrivalFade';
import { GlassPanel, useSurfaceInk } from './GlassPanel';
import { sessionCopy } from './sessionCopy';

// The goldens set the placeholder at 14.5 pt, 27 pt in from the edge of the glass.
const INPUT = { size: 14.5, line: 21 };
const PADDING = { top: 18, side: 26, bottom: 40 };
const NOTE = { left: 26, bottom: 12 };
// The tick after "Saved on this device". It starts a little smaller and settles to full size.
const CHECK = { size: 12, gap: 5, from: 0.6 };

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
  /** Counts the times spoken words have landed, so they settle in rather than jump. */
  arrival?: number;
}>;

/** The tick beside the note. Decorative: the words say it. */
function SavedCheck({ color }: { color: string }) {
  return (
    <Svg width={CHECK.size} height={CHECK.size} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Path
        d="M5 12.8l4.4 4.4L19 7.4"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * "Saved on this device": appears after the first save and stays, so autosaving never flickers. The
 * tick beside it draws in over 180 ms each time a save lands, and the first one comes with a gentle
 * haptic. Reduce Motion keeps the fade and drops the scale.
 */
function SavedNote({ visible, saved }: { visible: boolean; saved: boolean }) {
  const { text } = useSurfaceInk();
  const reduced = useReduceMotion();
  const opacity = useSharedValue(0);
  const check = useSharedValue(0);
  useEffect(() => {
    opacity.set(
      withTiming(visible ? 1 : 0, {
        duration: tokens.motion.fast,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [opacity, visible]);
  useEffect(() => {
    check.set(
      withTiming(saved ? 1 : 0, {
        duration: tokens.motion.fast,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [check, saved]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const tick = useAnimatedStyle(() => ({
    opacity: check.get(),
    transform: reduced ? [] : [{ scale: CHECK.from + (1 - CHECK.from) * check.get() }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.note, animated]}>
      <EchoText
        variant="caption"
        style={{ color: text, opacity: 0.7 }}
        accessibilityLiveRegion="polite"
      >
        {visible ? sessionCopy.saved : ' '}
      </EchoText>
      <Animated.View style={[styles.tick, tick]}>
        <SavedCheck color={text} />
      </Animated.View>
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
  arrival = 0,
  children,
}: Props) {
  const { name } = useTheme();
  const { text, muted, shadow } = useSurfaceInk();
  const [everSaved, setEverSaved] = useState(false);
  if (saveState === 'saved' && !everSaved) setEverSaved(true);
  const noteVisible = saveState === 'saved' || (saveState === 'saving' && everSaved);
  // Once, when the note first appears. Later autosaves are only the tick, so that writing is never
  // buzzed through.
  useEffect(() => {
    if (everSaved) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [everSaved]);
  const minHeight = squeezed ? SURFACE_KEYBOARD_MIN_HEIGHT : SURFACE_MIN_HEIGHT;

  return (
    <GlassPanel radius={SURFACE_RADIUS} style={[styles.surface, { minHeight }]}>
      {hideField ? (
        children
      ) : (
        <>
          <ArrivalFade arrival={arrival} style={styles.fill}>
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
          </ArrivalFade>
          <SavedNote visible={noteVisible} saved={saveState === 'saved'} />
        </>
      )}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, marginHorizontal: SURFACE_INSET },
  fill: { flex: 1 },
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
  note: {
    position: 'absolute',
    left: NOTE.left,
    bottom: NOTE.bottom,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CHECK.gap,
  },
  tick: { width: CHECK.size, height: CHECK.size, opacity: 0.7 },
});
