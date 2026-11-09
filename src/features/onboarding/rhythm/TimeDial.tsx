import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { TrackedText } from '@/components/TrackedText';
import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';
import { textStyle } from '@/design/typography';

import { DialFace, HandleLayer, REFERENCE_SIZE } from './DialFace';
import { Glass } from './Glass';
import {
  angleToMinutes,
  crossesHour,
  followTarget,
  minutesToAngle,
  nearestAngle,
  pointToAngle,
  SNAP_MINUTES,
  snapMinutes,
  stepMinutes,
  type ClockText,
} from './time';
import { useTone, type Tone } from './tone';
import { useClockTable } from './useClock';

// Dial size by viewport: 262 pt on the 393 pt reference, within the spec's 248 to 292 range.
const SIZE = { min: 248, max: 292, ratio: 262 / 393 };
export const dialSize = (width: number) =>
  Math.round(Math.min(SIZE.max, Math.max(SIZE.min, width * SIZE.ratio)));

const SETTLE_MS = 560; // a preset or the picker carries the handle round
const DEAD_ZONE = 70; // touches nearer the centre than this belong to the time, not the handle
const REACH = 22; // and touches this far past the rim still count
const SCREEN_READER_STEP = 15; // minutes per swipe for adjustable

// Measured from the golden, at reference size.
const TIME_BOX = { width: 156, height: 52 }; // the time's tap target
const TIME_CENTRE = -9.5; // time's centre, above the dial's
const DIVIDER = { y: 19.5, width: 19 };
const CAPTION = { y: 36, line: 15, size: 8.2, tracking: 1.5 };

type Props = {
  size: number;
  minutes: number;
  clock: ClockText;
  label: string;
  onChange: (minutes: number) => void;
  onOpenPicker: () => void;
  disabled?: boolean;
};

// Where the number sits, at reference size. The number is drawn by the UI thread into fields that
// cannot be measured again as it changes, so each has a width of its own: the hours and minutes are
// set against the right of theirs, and AM or PM against the left of its, which is how the pair is
// centred for the times people choose. A 24-hour clock has no AM or PM and one centred field.
const MAIN_BOX = 104;
const PERIOD_BOX = 52;
const PERIOD_GAP = 8;
const PAIR = MAIN_BOX + PERIOD_GAP + PERIOD_BOX;
/** How far right of the dial's centre the join of the two sits: the pair is centred for 9:30 and 6:00. */
const JOIN = 9;
/** The pair, centred in its box, has the join this far right of centre; it is moved to JOIN. */
const SHIFT = JOIN - (MAIN_BOX - PAIR / 2);

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/**
 * The time written on the dial: the time the handle is at, in every frame. The UI thread draws it
 * from the handle's own angle, as ReText draws a number, so it never waits for JS: a number that JS
 * was told to write, by a message from the UI thread, was seen half a second behind the handle on a
 * far tap (the walk, v9 and v10), and any round trip can be late on a real phone. What was chosen is
 * still said at once, to a screen reader and by the button's name, from the dial's `clock`, and this
 * is hidden from screen readers so that nothing is said twice. It is a part of its own so that
 * nothing else on the face is drawn again for it.
 */
function DialTime({ angle, k, tone }: { angle: SharedValue<number>; k: number; tone: Tone }) {
  const { mains, periods, twentyFour } = useClockTable();
  // `text` is how an animated field is written on the UI thread, `defaultValue` its first drawing.
  const main = useAnimatedProps(() => {
    const text = mains[snapMinutes(angleToMinutes(angle.get())) / SNAP_MINUTES] ?? '';
    return { text, defaultValue: text } as TextInputProps;
  });
  const period = useAnimatedProps(() => {
    const text = periods[snapMinutes(angleToMinutes(angle.get())) / SNAP_MINUTES] ?? '';
    return { text, defaultValue: text } as TextInputProps;
  });
  const field = {
    ...textStyle('displayL', { serif: true }),
    color: tone.ink,
    padding: 0,
    margin: 0,
    fontVariant: ['lining-nums'],
  } as const;
  return (
    <View
      testID="dial-time"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.written,
        twentyFour
          ? { width: TIME_BOX.width * k }
          : { width: PAIR * k, transform: [{ translateX: SHIFT * k }] },
      ]}
    >
      <AnimatedInput
        testID="dial-time-main"
        animatedProps={main}
        editable={false}
        allowFontScaling={false}
        underlineColorAndroid="transparent"
        style={[
          field,
          styles.main,
          twentyFour ? styles.alignCentre : styles.alignEnd,
          {
            fontSize: 43 * k,
            lineHeight: 50 * k,
            height: 50 * k,
            width: (twentyFour ? TIME_BOX.width : MAIN_BOX) * k,
          },
        ]}
      />
      {twentyFour ? null : (
        <AnimatedInput
          testID="dial-time-period"
          animatedProps={period}
          editable={false}
          allowFontScaling={false}
          underlineColorAndroid="transparent"
          style={[
            field,
            styles.alignStart,
            {
              fontSize: 34 * k,
              lineHeight: 50 * k,
              height: 50 * k,
              width: PERIOD_BOX * k,
              marginLeft: PERIOD_GAP * k,
              letterSpacing: 1.2,
            },
          ]}
        />
      )}
    </View>
  );
}

/**
 * A 24-hour glass dial. Dragging runs entirely on the UI thread: the pan gesture turns one shared
 * angle, and the handle and its arc rotate with it. Only a change of 5 minutes reports to React.
 */
export function TimeDial({
  size,
  minutes,
  clock,
  label,
  onChange,
  onOpenPicker,
  disabled = false,
}: Props) {
  const tone = useTone();
  const k = size / REFERENCE_SIZE;
  const centre = size / 2;
  const angle = useSharedValue(minutesToAngle(minutes));
  const last = useSharedValue(minutes);
  const engaged = useSharedValue(false);
  const reported = useRef(minutes);

  // A time chosen elsewhere (a preset, the picker) turns the handle the short way round.
  useEffect(() => {
    if (minutes === reported.current || engaged.get()) return;
    reported.current = minutes;
    last.set(minutes);
    angle.set(
      withTiming(nearestAngle(angle.get(), minutesToAngle(minutes)), {
        duration: SETTLE_MS,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [minutes, angle, last, engaged]);

  const report = useCallback(
    (next: number) => {
      reported.current = next;
      onChange(next);
    },
    [onChange],
  );
  const tick = useCallback(() => cue('fine'), []);

  const follow = (x: number, y: number) => {
    'worklet';
    const next = snapMinutes(angleToMinutes(pointToAngle(x - centre, y - centre)));
    const previous = last.get();
    if (next === previous) return;
    last.set(next);
    // Under the finger the handle is set directly, because a timing restarted at every step never
    // gets going; a touch far from the handle turns it the way a preset does.
    const { angle: target, glide } = followTarget(angle.get(), next);
    angle.set(
      glide
        ? withTiming(target, {
            duration: SETTLE_MS,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          })
        : target,
    );
    runOnJS(report)(next);
    if (crossesHour(previous, next)) runOnJS(tick)();
  };

  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 0,
    onBegin: (event) => {
      const distance = Math.hypot(event.x - centre, event.y - centre);
      engaged.set(distance >= DEAD_ZONE * k && distance <= centre + REACH);
      if (engaged.get()) follow(event.x, event.y);
    },
    onUpdate: (event) => {
      if (engaged.get()) follow(event.x, event.y);
    },
    onFinalize: () => {
      engaged.set(false);
    },
  });

  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));

  const nudge = (step: number) => onChange(stepMinutes(minutes, step));
  const caption = copy.rhythm.dialCaption.toUpperCase();
  const split = caption.lastIndexOf(' ');
  const lines = [caption.slice(0, split), caption.slice(split + 1)];

  return (
    <View style={[{ width: size, height: size }, disabled && styles.disabled]}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: clock.spoken }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') nudge(SCREEN_READER_STEP);
          if (nativeEvent.actionName === 'decrement') nudge(-SCREEN_READER_STEP);
        }}
        style={StyleSheet.absoluteFill}
      >
        <Glass
          radius={centre}
          fill={tone.dial}
          edge={tone.rim}
          contentStyle={{ width: size, height: size - 2 }}
        />
        <DialFace size={size} tone={tone} />
        <Animated.View style={[StyleSheet.absoluteFill, turn]} pointerEvents="none">
          <HandleLayer size={size} tone={tone} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={clock.spoken}
        accessibilityLiveRegion="polite"
        disabled={disabled}
        onPress={onOpenPicker}
        style={[
          styles.time,
          {
            top: centre + TIME_CENTRE * k - TIME_BOX.height / 2,
            left: centre - (TIME_BOX.width * k) / 2,
            width: TIME_BOX.width * k,
          },
        ]}
      >
        <DialTime angle={angle} k={k} tone={tone} />
      </Pressable>

      <View
        pointerEvents="none"
        style={[
          styles.rule,
          {
            top: centre + DIVIDER.y * k,
            left: centre - (DIVIDER.width * k) / 2,
            width: DIVIDER.width * k,
            backgroundColor: tone.inkSoft,
          },
        ]}
      />
      <View
        pointerEvents="none"
        accessible
        accessibilityLabel={copy.rhythm.dialCaption}
        style={[styles.caption, { top: centre + CAPTION.y * k - CAPTION.line / 2 }]}
      >
        {lines.map((line) => (
          <TrackedText
            key={line}
            text={line}
            tracking={CAPTION.tracking * k}
            variant="caption"
            style={{ fontSize: CAPTION.size * k, lineHeight: CAPTION.line, color: tone.inkSoft }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.42 },
  time: {
    position: 'absolute',
    height: TIME_BOX.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  written: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  main: { letterSpacing: 0.4 },
  alignEnd: { textAlign: 'right' },
  alignStart: { textAlign: 'left' },
  alignCentre: { textAlign: 'center' },
  rule: { position: 'absolute', height: 1 },
  caption: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
