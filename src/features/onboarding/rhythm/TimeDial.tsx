import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { TrackedText } from '@/components/TrackedText';
import { copy } from '@/content/copy';
import { cue } from '@/design/haptics';

import { DialFace, HandleLayer, REFERENCE_SIZE } from './DialFace';
import { Glass } from './Glass';
import {
  angleToMinutes,
  crossesHour,
  followTarget,
  minutesToAngle,
  nearestAngle,
  pointToAngle,
  snapMinutes,
  stepMinutes,
  type ClockText,
} from './time';
import { useTone, type Tone } from './tone';
import { useClockText } from './useClock';

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

/**
 * The time written on the dial: the time the handle is at. A far tap or a fast drag carries the
 * handle round over half a second, and the number rides with it, a step at a time: written at once it
 * was at its place while the handle was still turning, and read as a jump. What was chosen is still
 * said at once, to a screen reader and by the button's name, from the dial's `clock`. It is a part of
 * its own so that each step redraws only the number, never the face.
 */
function DialTime({
  angle,
  start,
  k,
  tone,
}: {
  angle: SharedValue<number>;
  start: number;
  k: number;
  tone: Tone;
}) {
  const [shown, setShown] = useState(start);
  const written = useClockText(shown);
  // The UI thread says that the handle has moved, and JS looks where it is. A message that carried
  // the time would arrive late on a busy thread, and every one queued behind it would write a time the
  // handle had passed: the number was seen reading 11:30 PM with the handle near 8:30 AM.
  const catchUp = useCallback(() => setShown(snapMinutes(angleToMinutes(angle.get()))), [angle]);
  useAnimatedReaction(
    () => snapMinutes(angleToMinutes(angle.get())),
    (now, was) => {
      if (now !== was) runOnJS(catchUp)();
    },
  );
  return (
    <EchoText
      variant="displayL"
      serif
      allowFontScaling={false}
      style={[styles.main, { fontSize: 43 * k, lineHeight: 50 * k, color: tone.ink }]}
    >
      {written.main}
      {written.period ? (
        <EchoText
          variant="displayL"
          serif
          allowFontScaling={false}
          style={{ fontSize: 34 * k, letterSpacing: 1.2, color: tone.ink }}
        >
          {` ${written.period}`}
        </EchoText>
      ) : null}
    </EchoText>
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
        <DialTime angle={angle} start={minutes} k={k} tone={tone} />
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
  main: { textAlign: 'center', letterSpacing: 0.4, fontVariant: ['lining-nums'] },
  rule: { position: 'absolute', height: 1 },
  caption: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
