import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoModal } from '@/components/EchoModal';
import { EchoText } from '@/components/EchoText';
import { parseColor } from '@/design/mixColor';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useTone } from '@/features/onboarding/rhythm/tone';

import { keepTogether } from './keepTogether';
import { detail, question, textAction } from './textStyles';

const MAX_WIDTH = 430;
const SIDE = tokens.space[12];

type Props = PropsWithChildren<{
  visible: boolean;
  /** The system Back button, Escape, and a tap outside the sheet. */
  onClose: () => void;
  /** Always in view beneath the part that scrolls: the sheet's actions. */
  footer?: ReactNode;
  /** False to go at once instead of fading, as when the lock takes the screen: nothing fades over it. */
  animated?: boolean;
  /** Names the sheet's window, where Back arrives. The dimmed page around it is `${testID}-outside`. */
  testID?: string;
}>;

/**
 * A sheet over the page, in the same cloth as the voice consent sheet: cream with ink by Day,
 * midnight with cream by Night, a fine edge and no shadow. It fades in and out, which is all Reduce
 * Motion would leave of it anyway. The person never loses their place beneath it.
 */
export function Sheet({ visible, onClose, footer, animated = true, children, testID }: Props) {
  const tone = useTone();
  const { bottom } = useSafeAreaInsets();
  // The consent sheet's cloth, made whole: nothing of the page should read through a sheet.
  const rgb = parseColor(tone.sheet);
  const cloth = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : tone.sheet;
  return (
    <EchoModal
      transparent
      animationType={animated ? 'fade' : 'none'}
      visible={visible}
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.scrim}>
        <Pressable
          testID={testID && `${testID}-outside`}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[
            styles.sheet,
            {
              backgroundColor: cloth,
              borderColor: tone.edge,
              marginBottom: Math.max(bottom, SIDE) + tokens.space[8],
            },
          ]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </EchoModal>
  );
}

/** A sheet's heading: Cormorant, in the sheet's ink. */
export function SheetTitle({ children }: { children: string }) {
  const tone = useTone();
  return (
    <EchoText
      variant="bodyL"
      accessibilityRole="header"
      accessibilityLabel={children}
      maxFontSizeMultiplier={1.5}
      style={[question, { color: tone.ink }]}
    >
      {keepTogether(children)}
    </EchoText>
  );
}

/** A sheet's running text. `soft` for the quieter second voice. */
export function SheetText({ children, soft }: { children: string; soft?: boolean }) {
  const tone = useTone();
  return (
    <EchoText
      variant="bodyM"
      maxFontSizeMultiplier={1.6}
      style={[detail, { color: soft ? tone.inkSoft : tone.ink }]}
    >
      {keepTogether(children)}
    </EchoText>
  );
}

const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton

/**
 * The sheet's one primary action, at the CTA's geometry: 56 pt, fully rounded, the width of the
 * sheet. Cream with ink by Night, as every primary action is; by Day the sheet itself is cream, so
 * the button is ink with cream type, the same two colours turned over.
 */
export function SheetButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  hint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Read when it is disabled: what is needed first. */
  hint?: string;
}) {
  const { name, colors } = useTheme();
  const day = name === 'day';
  const blocked = disabled || busy;
  const labelColour = day ? colors.textPrimary : colors.textInk;
  const caption = (
    <EchoText
      variant="label"
      numberOfLines={1}
      maxFontSizeMultiplier={1.4}
      style={{ color: labelColour }}
    >
      {label}
    </EchoText>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? hint : undefined}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        blocked && styles.blocked,
        pressed && styles.buttonPressed,
      ]}
    >
      {day ? (
        <View style={[styles.fill, { backgroundColor: colors.textInk }]}>{caption}</View>
      ) : (
        <LinearGradient
          colors={CREAM_STOPS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        >
          {caption}
        </LinearGradient>
      )}
    </Pressable>
  );
}

/** A quiet word to tap inside a sheet, such as Cancel. Sentence case, 44 pt tall. */
export function SheetAction({ label, onPress }: { label: string; onPress: () => void }) {
  const tone = useTone();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <EchoText
        variant="bodyM"
        maxFontSizeMultiplier={1.5}
        style={[textAction, { color: tone.ink }]}
      >
        {label}
      </EchoText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SIDE,
    backgroundColor: 'rgba(3,11,22,0.5)',
  },
  sheet: {
    width: '100%',
    maxWidth: MAX_WIDTH - SIDE * 2,
    maxHeight: '86%',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scroll: { flexGrow: 0 },
  body: {
    gap: tokens.space[12],
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[24],
    paddingBottom: tokens.space[8],
  },
  footer: {
    alignItems: 'stretch',
    gap: tokens.space[4],
    paddingHorizontal: tokens.space[16],
    paddingTop: tokens.space[12],
    paddingBottom: tokens.space[8],
  },
  action: { minHeight: tokens.size.tapTarget, justifyContent: 'center', alignSelf: 'center' },
  pressed: { opacity: 0.6 },
  button: {
    height: tokens.size.primaryButtonHeight,
    borderRadius: tokens.radius.button,
    overflow: 'hidden',
  },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  blocked: { opacity: 0.42 },
  buttonPressed: { transform: [{ scale: 0.985 }] },
});
