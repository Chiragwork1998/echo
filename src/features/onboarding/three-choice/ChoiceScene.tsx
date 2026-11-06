import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { usePlatePoint } from '@/design/usePlatePoint';

import type { Option } from './ChoiceList';
import { ChoiceMark, MARK, Stem } from './ChoiceMark';
import { PathGlow } from './PathGlow';
import { breakDetail, type Scene } from './scenes';

// A stem dropping onto a path starts this far below the text above it.
const LOWER_STEM_GAP = 8;
const MIN_LOWER_STEM = 6;

type Props<V extends string> = {
  label: string;
  scene: Scene<V>;
  options: readonly Option<V>[];
  selected?: V;
  onSelect: (value: V) => void;
};

/**
 * The three choices pinned to the photograph: each a ring on a stem with its title and detail, and
 * on Voice a second stem that lands on its path, which glows when chosen. Anchors map through
 * usePlatePoint so every choice stays on its ridge or path on every phone.
 */
export function ChoiceScene<V extends string>({
  label,
  scene,
  options,
  selected,
  onSelect,
}: Props<V>) {
  const toScreen = usePlatePoint();
  const { width } = useWindowDimensions();
  const column = Math.min(MARK.column, width / 3 - 2);
  // The titles share one row in the golden, a little off each ring.
  const row = scene.choices.reduce((sum, c) => sum + c.ring.y, 0) / scene.choices.length;
  const lines = useMemo(
    () => scene.choices.map(({ path }) => path?.line.map((q) => toScreen(q.x, q.y))),
    [scene, toScreen],
  );

  return (
    <View
      testID="choice-scene"
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {scene.choices.map(({ value }, i) => {
        const line = lines[i];
        return line && <PathGlow key={value} line={line} selected={value === selected} />;
      })}
      {scene.choices.map(({ value, ring, path, detailBreak }) => {
        const option = options.find((o) => o.value === value);
        if (!option) return null;
        const at = toScreen(ring.x, ring.y);
        const rowShift = toScreen(ring.x, row).y - at.y;
        const left = Math.min(Math.max(at.x - column / 2, 0), width - column);
        const textLines = detailBreak ? 2 : 1;
        const textBottom = at.y + rowShift + MARK.detailTop + scene.type.detailLine * textLines;
        const stemTop = textBottom + LOWER_STEM_GAP;
        const stemLength = path ? toScreen(ring.x, path.stemEnd).y - stemTop : 0;
        return (
          <View key={value} style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {stemLength > MIN_LOWER_STEM && (
              <View
                pointerEvents="none"
                style={[styles.lower, { left: left + (column - MARK.stemWidth) / 2, top: stemTop }]}
              >
                <Stem height={stemLength} />
              </View>
            )}
            <ChoiceMark
              title={option.title}
              detail={option.detail}
              detailText={breakDetail(option.detail, detailBreak)}
              left={left}
              top={at.y}
              width={column}
              rowShift={rowShift}
              ring={scene.ring}
              type={scene.type}
              selected={value === selected}
              onSelect={() => onSelect(value)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  lower: { position: 'absolute' },
});
