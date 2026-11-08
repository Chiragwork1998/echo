import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EASE, clamp01 } from '@/design/ease';

import { isLatinName } from './name';

/** The feather: a second window this far ahead of the first, showing the name at half its strength. */
const FEATHER = 14;
/** The name is pressed into the cloth: a dark copy just below and to the right of the foil. */
const DEBOSS = { x: 0.7, y: 0.9, colour: 'rgba(0,0,0,0.38)' } as const;
/** An italic leans past its own advance: the window is this much wider than the name, by its size. */
const OVERHANG = 0.35;

/** How long the stamp takes for a name this long: longer names take a little longer, within reason. */
export function stampMs(name: string): number {
  return Math.min(900, Math.max(600, 600 + 25 * Array.from(name).length));
}

/** The type a name is set in: the serif italic for Latin letters, the system serif, upright, otherwise. */
export function nameType(name: string): TextStyle {
  return isLatinName(name)
    ? { fontFamily: 'CormorantGaramond_400Regular_Italic' }
    : { fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontStyle: 'normal' };
}

type Props = {
  name: string;
  colour: string;
  fontSize: number;
  /**
   * Stamp it now: a window slides over the name from left to right and the foil is there where it
   * has passed. It begins once the name has been measured, after `delay`. Left out, the name is
   * simply there.
   */
  stamping?: { delay: number; duration: number } | null;
  /** Ink on a page rather than foil in cloth: no debossed copy beneath it. */
  plain?: boolean;
  testID?: string;
};

/**
 * A name in foil, stamped into the cloth. The stamp is a window that slides in while the name inside it
 * is slid back the same distance, so the name stands still and only the edge of what is shown moves:
 * transform only, with no mask (masks do not refresh reliably under animation on Android). A second
 * window just ahead at half strength softens the edge; the debossed copy beneath is revealed with it.
 */
export function InscribedName({
  name,
  colour,
  fontSize,
  stamping = null,
  plain = false,
  testID,
}: Props) {
  const [width, setWidth] = useState(0);
  const edge = useSharedValue(stamping ? 0 : 1);
  const [feathered, setFeathered] = useState(Boolean(stamping));
  const delay = stamping?.delay ?? 0;
  const duration = stamping?.duration ?? 0;
  const live = stamping !== null;

  useEffect(() => {
    if (!live || width === 0) return;
    edge.set(0);
    edge.set(
      withDelay(delay, withTiming(1, { duration, easing: EASE, reduceMotion: ReduceMotion.Never })),
    );
    // The feather would thicken the foil's edges once both windows cover the whole name.
    const done = setTimeout(() => setFeathered(false), delay + duration);
    return () => clearTimeout(done);
  }, [live, width, delay, duration, edge]);

  const type = nameType(name);
  const line = Math.round(fontSize * 1.3);
  const text: TextStyle[] = [styles.text, type, { fontSize, lineHeight: line }];
  const span = width + fontSize * OVERHANG;

  const words = (
    <>
      {!plain && (
        <Text
          style={[...text, styles.layer, { color: DEBOSS.colour, left: DEBOSS.x, top: DEBOSS.y }]}
          numberOfLines={1}
        >
          {name}
        </Text>
      )}
      <Text style={[...text, { color: colour }]} numberOfLines={1}>
        {name}
      </Text>
    </>
  );

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: line }}
    >
      {/* Never seen: it says how wide the name is, so the window knows how far to travel. */}
      <Text
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[...text, styles.measure]}
        numberOfLines={1}
      >
        {name}
      </Text>
      {live ? (
        <>
          <Window edge={edge} span={span} lead={0} height={line}>
            {words}
          </Window>
          {feathered && (
            <Window edge={edge} span={span} lead={FEATHER} height={line} faint>
              <Text style={[...text, { color: colour }]} numberOfLines={1}>
                {name}
              </Text>
            </Window>
          )}
        </>
      ) : (
        <View style={{ height: line }}>{words}</View>
      )}
    </View>
  );
}

/**
 * A window over the name whose right edge travels from just before the name (at 0) to just past it (at
 * 1). `lead` puts the edge that far ahead, for the feather.
 */
function Window({
  edge,
  span,
  lead,
  height,
  faint = false,
  children,
}: {
  edge: SharedValue<number>;
  /** How wide the window is: the name and the lean of its last letter. */
  span: number;
  lead: number;
  height: number;
  faint?: boolean;
  children: ReactNode;
}) {
  const frame = useAnimatedStyle(() => {
    const at = (span + FEATHER) * clamp01(edge.get()) - FEATHER + lead;
    return { transform: [{ translateX: at - span }] };
  }, [span, lead]);
  const hold = useAnimatedStyle(() => {
    const at = (span + FEATHER) * clamp01(edge.get()) - FEATHER + lead;
    return { transform: [{ translateX: span - at }] };
  }, [span, lead]);
  return (
    <Animated.View
      style={[styles.window, { width: span, height, opacity: faint ? 0.5 : 1 }, frame]}
    >
      <Animated.View style={[styles.hold, hold]}>{children}</Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  text: { includeFontPadding: false },
  layer: { position: 'absolute' },
  measure: { position: 'absolute', opacity: 0, left: 0, top: 0 },
  window: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  hold: { position: 'absolute', left: 0, top: 0, flexDirection: 'row' },
});
