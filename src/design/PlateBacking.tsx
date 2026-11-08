import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { backgroundSources } from './generated/backgrounds';
import { plateColour } from './plateColour';
import { useBackingPlate, type ShownPlate } from './platePaint';
import { useTheme } from './theme';

const sameAs = (a: ShownPlate | null, b: ShownPlate | null) =>
  a?.theme === b?.theme && a?.screen === b?.screen;
const keyOf = (plate: ShownPlate) => `${plate.theme}/${plate.screen}`;

function Photograph({
  plate,
  onDrawn,
}: {
  plate: ShownPlate;
  /** Drawn, or never to be: either way nothing more is to be waited for. */
  onDrawn?: (plate: ShownPlate) => void;
}) {
  const done = useCallback(() => onDrawn?.(plate), [onDrawn, plate]);
  return (
    <Image
      source={backgroundSources[plate.theme][plate.screen]}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      contentPosition="center"
      transition={0}
      onLoad={done}
      onDisplay={done}
      onError={done}
    />
  );
}

/**
 * The plate that was last on show, drawn beneath the whole navigator and above nothing, so that a
 * flat colour can never be what is on the screen. Every screen's own plate sits above it, and every
 * screen's own background is clear, so that wherever a screen has not drawn its photograph yet, which
 * is at the moment it arrives and for as long as the photograph takes to decode, the photograph that
 * was there is still there. It is only ever seen at those moments: a plate that is drawn covers it.
 *
 * It draws the very same image source as the plate it stands for, at the same size, so expo-image's
 * memory cache serves it and no second copy of the picture is decoded or held. It never changes to a
 * plate that has not been drawn (a plate reports itself once it is wholly up: see EchoBackground), so
 * what it asks for is always already in that cache. And it changes without a gap: the photograph
 * that was on show stays beneath the new one until the new one has been drawn, so there is no
 * moment at which it is empty. At most two photographs are held, and only for that moment.
 *
 * A flat colour, the plate's dominant colour and never white, is only what it stands on before the
 * first plate has been drawn, which the splash covers.
 */
export function PlateBacking() {
  const { target, colors } = useTheme();
  const wanted = useBackingPlate();
  // The photograph that has been drawn here, which is what is on show while the wanted one is drawn.
  const [drawn, setDrawn] = useState<ShownPlate | null>(null);
  const settle = useCallback((plate: ShownPlate) => setDrawn(plate), []);

  const beneath = drawn && !sameAs(drawn, wanted) ? drawn : null;
  const base = plateColour(
    (wanted ?? drawn)?.theme ?? target,
    (wanted ?? drawn)?.screen ?? 'landing',
    colors.textInk,
  );

  return (
    <View
      testID="plate-backing"
      style={[StyleSheet.absoluteFill, { backgroundColor: base }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {beneath && <Photograph key={keyOf(beneath)} plate={beneath} />}
      {wanted && <Photograph key={keyOf(wanted)} plate={wanted} onDrawn={settle} />}
    </View>
  );
}
