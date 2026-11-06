import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { EchoText } from '@/components/EchoText';
import { SoftScrim } from '@/components/SoftScrim';
import { useTheme } from '@/design/theme';
import { tokens, type ThemeName } from '@/design/tokens';

import type { Scene } from './scenes';

// Measured from the goldens, relative to the row the three titles share. All in points.
export const MARK = {
  hit: tokens.size.tapTarget,
  /** Widest a choice's text may be. Columns shrink on narrow phones so neighbours never overlap. */
  column: 120,
  stemGap: 5.7,
  stemLength: 22.5,
  stemWidth: 1,
  ringStroke: 1.3,
  titleTop: 39.4,
  titleLine: 21,
  detailTop: 61.8,
  /** Room for a two line detail below the row, for the touch target. */
  bottom: 88,
} as const;

// The golden sets details in a light weight, as it does the heading's subtitle (C-12).
const DETAIL = { fontFamily: 'Inter_300Light' } as const;
// A soft shadow keeps white text and hairlines readable on bright cloud and snow.
const TEXT_SHADOW = {
  textShadowColor: 'rgba(3,11,22,0.55)',
  textShadowRadius: 7,
  textShadowOffset: { width: 0, height: 1 },
} as const;
const HAIRLINE_SHADOW = '0 0 3px rgba(3,11,22,0.45)';
const SCRIM = { alpha: { day: 0.42, night: 0.26 }, x: 18, top: 8, bottom: 14 };
const GLOW: Record<ThemeName, string> = {
  night: '0 0 12px rgba(255,226,170,0.6)',
  day: '0 0 10px rgba(255,236,196,0.55)',
};
const DISC = '#FBF8F2';
const PRESS_SCALE = 0.94;
const POP_FROM = 0.96;
const SPRING = { ...tokens.motion.spring, reduceMotion: ReduceMotion.System };

/** The hairline that links a ring, or a title, to the scenery. */
export function Stem({ height }: { height: number }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        width: MARK.stemWidth,
        height,
        borderRadius: MARK.stemWidth / 2,
        backgroundColor: colors.textPrimary,
        boxShadow: HAIRLINE_SHADOW,
      }}
    />
  );
}

type Props = {
  title: string;
  detail: string;
  /** The detail with its line break, as drawn in the golden. */
  detailText: string;
  /** Left edge and ring-centre height on screen, and how far the shared text row sits below it. */
  left: number;
  top: number;
  width: number;
  rowShift: number;
  ring: number;
  type: Scene<string>['type'];
  selected: boolean;
  onSelect: () => void;
};

/**
 * One choice: a ring on a stem, with its title and detail underneath. The whole column is the radio,
 * so the touch target is far past 44 pt. Chosen, the ring fills with a warm glowing disc.
 */
export function ChoiceMark({
  title,
  detail,
  detailText,
  left,
  top,
  width,
  rowShift,
  ring,
  type,
  selected,
  onSelect,
}: Props) {
  const { name, colors } = useTheme();
  const progress = useSharedValue(selected ? 1 : 0);
  const pop = useSharedValue(1);
  const press = useSharedValue(0);

  useEffect(() => {
    progress.set(withSpring(selected ? 1 : 0, SPRING));
    if (selected) {
      pop.set(POP_FROM);
      pop.set(withSpring(1, SPRING));
    }
  }, [selected, progress, pop]);

  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: pop.get() * (1 - (1 - PRESS_SCALE) * press.get()) }],
  }));
  const disc = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get() * 1.4),
    transform: [{ scale: 0.4 + 0.6 * progress.get() }],
  }));

  const half = MARK.hit / 2;
  const centre = (width - MARK.hit) / 2;
  const row = half + rowShift;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{ selected, checked: selected }}
      onPress={onSelect}
      onPressIn={() =>
        press.set(
          withTiming(1, { duration: tokens.motion.instant, reduceMotion: ReduceMotion.System }),
        )
      }
      onPressOut={() => press.set(withSpring(0, SPRING))}
      style={{ position: 'absolute', left, top: top - half, width, height: row + MARK.bottom }}
    >
      <Animated.View
        style={[styles.slot, { left: centre, width: MARK.hit, height: MARK.hit }, mark]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={{
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: MARK.ringStroke,
            borderColor: colors.textPrimary,
            backgroundColor: 'rgba(8,20,38,0.2)',
            boxShadow: HAIRLINE_SHADOW,
          }}
        />
        <Animated.View
          style={[
            styles.disc,
            { width: ring + 0.8, height: ring + 0.8, borderRadius: ring, boxShadow: GLOW[name] },
            disc,
          ]}
        />
      </Animated.View>
      <View
        style={[
          styles.stem,
          { left: (width - MARK.stemWidth) / 2, top: half + ring / 2 + MARK.stemGap },
        ]}
      >
        <Stem height={MARK.stemLength} />
      </View>
      <View pointerEvents="none" style={[styles.text, { top: row + MARK.titleTop }]}>
        <View
          style={[
            styles.scrim,
            { left: -SCRIM.x, right: -SCRIM.x, top: -SCRIM.top, bottom: -SCRIM.bottom },
          ]}
        >
          <SoftScrim alpha={SCRIM.alpha[name]} />
        </View>
        <EchoText
          variant="bodyL"
          serif
          align="center"
          maxFontSizeMultiplier={1.2}
          style={[{ fontSize: type.title, lineHeight: MARK.titleLine }, TEXT_SHADOW]}
        >
          {title}
        </EchoText>
        <EchoText
          variant="bodyM"
          color="textSecondary"
          align="center"
          maxFontSizeMultiplier={1.2}
          style={[
            DETAIL,
            { fontSize: type.detail, lineHeight: type.detailLine },
            styles.detail,
            TEXT_SHADOW,
          ]}
        >
          {detailText}
        </EchoText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', top: 0, alignItems: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', backgroundColor: DISC },
  stem: { position: 'absolute' },
  text: { position: 'absolute', left: 0, right: 0, alignItems: 'stretch' },
  scrim: { position: 'absolute' },
  detail: { marginTop: MARK.detailTop - MARK.titleTop - MARK.titleLine },
});
