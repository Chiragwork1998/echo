import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';

import {
  IDLE_LABEL_SCALE,
  LABEL,
  MARKER,
  placeLabel,
  type LabelPlacement,
  type Point,
} from './geometry';
import { RiverMarker } from './RiverMarker';
import { SoftScrim } from '@/components/SoftScrim';

const SELECTED_LABEL_SHIFT = (MARKER.selectedDiameter - MARKER.idleDiameter) / 2;
// The label starts a fixed gap from the resting ring, so it overlaps the marker's 44 pt slot.
const LABEL_OVERLAP = MARKER.hit / 2 - (MARKER.idleDiameter / 2 + MARKER.labelGap);
// Extra touch area past the end of the label, so the label is easy to hit as well as the ring.
const HIT_TAIL = 8;
// Soft local shadow so labels stay readable on bright water and cloud, without darkening the plate.
const LABEL_SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.6)',
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
} as const;

// Soft dark patch behind each label, feathered so the photograph is only touched around the words.
// Measured against both plates: bright water and cloud sit under Hold, Find and the Day subtitle.
const SCRIM = { alpha: { day: 0.46, night: 0.4 }, near: 6, far: 26, vertical: 16 };

// Cormorant sits a little high in its line box, against the golden's baseline.
const LABEL_DROP = 1.2;

const SPRING = { ...tokens.motion.spring, reduceMotion: ReduceMotion.System };
const RESTING_PLACEMENT: LabelPlacement = { side: 'right', selectedScale: 1 };

type Props = {
  label: string;
  /** Centre of the marker on screen. */
  at: Point;
  screenWidth: number;
  selected: boolean;
  onSelect: () => void;
};

/**
 * One choice on the river: a radio control whose touch target covers the ring and its label. The
 * ring blooms into a warm glowing ring on selection, and the label steps out and grows to match.
 */
export function RiverPoint({ label, at, screenWidth, selected, onSelect }: Props) {
  const { name } = useTheme();
  const progress = useSharedValue(selected ? 1 : 0);
  const press = useSharedValue(0);
  const [textWidth, setTextWidth] = useState<number>();

  useEffect(() => {
    progress.set(withSpring(selected ? 1 : 0, SPRING));
  }, [selected, progress]);

  const placement =
    textWidth === undefined ? RESTING_PLACEMENT : placeLabel(at.x, textWidth, screenWidth);
  const flipped = placement.side === 'left';
  const direction = flipped ? -1 : 1;

  const labelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: direction * SELECTED_LABEL_SHIFT * progress.get() },
      { scale: IDLE_LABEL_SCALE + (placement.selectedScale - IDLE_LABEL_SCALE) * progress.get() },
    ],
  }));

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      onPress={onSelect}
      onPressIn={() =>
        press.set(
          withTiming(1, { duration: tokens.motion.instant, reduceMotion: ReduceMotion.System }),
        )
      }
      onPressOut={() => press.set(withSpring(0, SPRING))}
      style={[
        styles.hit,
        { top: at.y - MARKER.hit / 2, flexDirection: flipped ? 'row-reverse' : 'row' },
        flipped
          ? { right: screenWidth - (at.x + MARKER.hit / 2) }
          : { left: at.x - MARKER.hit / 2 },
      ]}
    >
      <View style={styles.slot}>
        <RiverMarker progress={progress} press={press} />
      </View>
      <Animated.View
        style={[
          flipped
            ? { marginRight: -LABEL_OVERLAP, marginLeft: HIT_TAIL }
            : { marginLeft: -LABEL_OVERLAP, marginRight: HIT_TAIL },
          {
            transformOrigin: flipped ? 'right center' : 'left center',
            opacity: textWidth === undefined ? 0 : 1,
          },
          labelStyle,
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.scrim,
            flipped
              ? { left: -SCRIM.far, right: -SCRIM.near }
              : { left: -SCRIM.near, right: -SCRIM.far },
          ]}
        >
          <SoftScrim alpha={SCRIM.alpha[name]} />
        </View>
        <EchoText
          variant="bodyL"
          serif
          numberOfLines={1}
          style={[styles.label, LABEL_SHADOW]}
          onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
        >
          {label}
        </EchoText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { position: 'absolute', height: MARKER.hit, alignItems: 'center' },
  slot: { width: MARKER.hit, height: MARKER.hit, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', top: -SCRIM.vertical, bottom: -SCRIM.vertical },
  label: { fontSize: LABEL.selectedSize, lineHeight: 20, top: LABEL_DROP },
});
