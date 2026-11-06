import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { copy } from '@/content/copy';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { sessionCopy } from './sessionCopy';
import { CONTROLS, useSkyInk } from './sky';

const COME_MS = 900;
const GO_MS = 160;
const SIDE = 22;

type Props = {
  /** Fades in when true, and out at once when false. Never leaves the tree, so a screen reader finds it. */
  visible: boolean;
  /** What the middle word offers: the other way to write, or to stop what is recording. */
  middle: 'speak' | 'write' | 'stop';
  /** The middle word cannot be used just now, such as while a recording is being kept safe. */
  middleDisabled: boolean;
  canReflect: boolean;
  reflecting: boolean;
  onBack: () => void;
  onMiddle: () => void;
  onReflect: () => void;
};

const MIDDLE_LABEL = {
  speak: copy.firstEcho.speak,
  write: copy.firstEcho.write,
  stop: sessionCopy.quiet.stop,
} as const;

function Word(props: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const { quiet, text, shadow } = useSkyInk();
  const { label, onPress, strong = false, disabled = false, busy = false, testID } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [styles.word, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}
    >
      <EchoText
        variant="bodyL"
        serif
        maxFontSizeMultiplier={1.4}
        style={[styles.label, { color: strong ? text : quiet }, shadow]}
      >
        {label}
      </EchoText>
    </Pressable>
  );
}

/**
 * A way back, the other way to write, and Reflect: three words low on the sky, closer to a whisper
 * than a toolbar. They fade in when wanted and are gone when the writing resumes.
 */
export function QuietControls({
  visible,
  middle,
  middleDisabled,
  canReflect,
  reflecting,
  onBack,
  onMiddle,
  onReflect,
}: Props) {
  const reduced = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(visible ? 1 : 0, {
        duration: reduced ? tokens.motion.instant : visible ? COME_MS : GO_MS,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [reduced, shown, visible]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));

  return (
    <Animated.View
      style={[styles.row, fade]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <View style={[styles.slot, styles.start]}>
        <Word label={sessionCopy.quiet.back} onPress={onBack} testID="quiet-back" />
      </View>
      <View style={[styles.slot, styles.middle]}>
        <Word
          label={MIDDLE_LABEL[middle]}
          onPress={onMiddle}
          disabled={middleDisabled}
          testID="quiet-middle"
        />
      </View>
      <View style={[styles.slot, styles.end]}>
        {canReflect && (
          <Word
            label={copy.firstEcho.cta}
            onPress={onReflect}
            strong
            busy={reflecting}
            disabled={reflecting}
            testID="quiet-reflect"
          />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: CONTROLS.height,
    paddingHorizontal: SIDE,
  },
  slot: { flex: 1, minHeight: CONTROLS.height, justifyContent: 'center' },
  start: { alignItems: 'flex-start' },
  middle: { alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  word: { minHeight: CONTROLS.height, minWidth: CONTROLS.height, justifyContent: 'center' },
  label: {
    fontFamily: 'CormorantGaramond_500Medium',
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: 0.7,
  },
});
