import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextStyle,
} from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { EASE } from '@/design/ease';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { bookCopy } from '@/features/book/bookCopy';
import { NAME_MAX, sanitiseName } from '@/features/book/name';

import { QuietWord } from './QuietControls';
import { CONTROLS, useSkyInk } from './sky';

/** With no keystroke for this long, the question is let go: Not now. It never holds Completion back. */
export const NAME_IDLE_MS = 45_000;
/** The keys come once the question has been read. */
export const NAME_FOCUS_MS = 900;
/** The prompt leaves this quickly once it is answered. */
export const NAME_LEAVE_MS = 240;
const SIDE = 22;
const LINE_ALPHA = 0.82;

/**
 * Web draws a focus ring around a text field, and an `auto` ring ignores a width of nothing. Only
 * web: Android cannot parse an outline style.
 */
const noRing = (Platform.OS === 'web'
  ? { outlineStyle: 'none', outlineWidth: 0 }
  : {}) as unknown as TextStyle;

type Props = {
  /** Answered: it fades away. */
  leaving: boolean;
  onWrite: (name: string) => void;
  onNotNow: () => void;
  /** How tall it is, so the book can keep clear of it. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

/**
 * "Whose book is this?", asked once, on the closed book, after an entry has been kept. The question,
 * a line saying where the name goes and that it stays on this phone, a field, and two words where the
 * quiet row's were: Not now and Write it. Not now is always on screen, and Back means the same. With
 * no keystroke for 45 seconds it lets itself go. The keys come after the question has been read.
 */
export function NamePrompt({ leaving, onWrite, onNotNow, onLayout }: Props) {
  const { name: theme } = useTheme();
  const ink = useSkyInk();
  const reduced = useReduceMotion();
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const [value, setValue] = useState('');
  const written = sanitiseName(value);

  // The question comes first and rises a little, the line after it, then the field and the words.
  const question = useSharedValue(0);
  const rise = useSharedValue(reduced ? 0 : 8);
  const line = useSharedValue(0);
  const rest = useSharedValue(0);
  const gone = useSharedValue(0);
  useEffect(() => {
    const timing = (duration: number) => ({
      duration,
      easing: EASE,
      reduceMotion: ReduceMotion.Never,
    });
    if (reduced) {
      const fade = timing(tokens.motion.fast);
      question.set(withTiming(1, fade));
      line.set(withTiming(LINE_ALPHA, fade));
      rest.set(withTiming(1, fade));
      return;
    }
    question.set(withDelay(100, withTiming(1, timing(560))));
    rise.set(withDelay(100, withTiming(0, timing(480))));
    line.set(withDelay(300, withTiming(LINE_ALPHA, timing(560))));
    rest.set(withDelay(500, withTiming(1, timing(480))));
  }, [line, question, reduced, rest, rise]);
  useEffect(() => {
    if (!leaving) return;
    gone.set(
      withTiming(1, {
        duration: reduced ? tokens.motion.fast : NAME_LEAVE_MS,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [gone, leaving, reduced]);
  const asked = useAnimatedStyle(() => ({
    opacity: question.get() * (1 - gone.get()),
    transform: [{ translateY: rise.get() }],
  }));
  const said = useAnimatedStyle(() => ({ opacity: line.get() * (1 - gone.get()) }));
  const offered = useAnimatedStyle(() => ({ opacity: rest.get() * (1 - gone.get()) }));

  // A screen reader hears the question as it appears; the keys come after it has been read.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${bookCopy.name.question} ${bookCopy.name.line}`);
    const timer = setTimeout(() => field.current?.focus(), NAME_FOCUS_MS);
    return () => clearTimeout(timer);
  }, []);

  // Left alone, it lets itself go: the question never holds the next screen back for long.
  const latest = useRef(onNotNow);
  useEffect(() => {
    latest.current = onNotNow;
  });
  useEffect(() => {
    if (leaving) return;
    const timer = setTimeout(() => latest.current(), NAME_IDLE_MS);
    return () => clearTimeout(timer);
  }, [leaving, value]);

  const write = () => {
    if (leaving || !written) return;
    onWrite(written);
  };

  return (
    <View
      style={styles.prompt}
      onLayout={onLayout}
      pointerEvents={leaving ? 'none' : 'box-none'}
      testID="name-prompt"
    >
      <Animated.View style={[styles.column, asked]}>
        <EchoText
          variant="bodyL"
          serif
          align="center"
          accessibilityRole="header"
          maxFontSizeMultiplier={1.5}
          style={[styles.question, { color: ink.text }, ink.shadow]}
        >
          {bookCopy.name.question}
        </EchoText>
      </Animated.View>
      <Animated.View style={[styles.column, said]}>
        <EchoText
          variant="bodyM"
          serif
          align="center"
          maxFontSizeMultiplier={1.5}
          style={[styles.line, { color: ink.text }, ink.shadow]}
        >
          {bookCopy.name.line}
        </EchoText>
      </Animated.View>
      <Animated.View style={[styles.column, offered]}>
        <TextInput
          ref={field}
          testID="name-field"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={write}
          editable={!leaving}
          placeholder={bookCopy.name.placeholder}
          placeholderTextColor={ink.quiet}
          accessibilityLabel={bookCopy.name.placeholder}
          // Kept from the phone's suggestion and autofill stores, as First Echo's field is
          // (docs/DATA_CONTRACT.md). The keyboard may still learn the word; ECHO cannot stop that.
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="words"
          maxLength={NAME_MAX}
          returnKeyType="done"
          keyboardAppearance={theme === 'night' ? 'dark' : 'light'}
          selectionColor={ink.glow}
          cursorColor={ink.glow}
          underlineColorAndroid="transparent"
          maxFontSizeMultiplier={1.4}
          style={[styles.field, noRing, { color: ink.text, borderBottomColor: ink.quiet }]}
        />
      </Animated.View>
      <Animated.View style={[styles.words, offered]}>
        <QuietWord label={bookCopy.name.notNow} onPress={onNotNow} testID="name-not-now" />
        <QuietWord
          label={bookCopy.name.write}
          onPress={write}
          strong
          disabled={!written}
          testID="name-write"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  prompt: { paddingTop: tokens.space[8] },
  column: { alignItems: 'center', paddingHorizontal: SIDE },
  question: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  line: {
    marginTop: 4,
    fontFamily: 'CormorantGaramond_400Regular',
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  field: {
    marginTop: tokens.space[12],
    minWidth: 220,
    paddingVertical: 4,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    fontFamily: 'CormorantGaramond_400Regular_Italic',
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
  },
  words: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: CONTROLS.height,
    paddingHorizontal: SIDE,
  },
});
