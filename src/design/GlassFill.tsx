import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useThemeMix } from './theme';
import { tokens } from './tokens';

/**
 * The tint of a piece of glass: Day's and Night's, drawn together and faded one into the other by the
 * theme's mix (see ThemeValue.mix), which the UI thread moves with the photograph. One of the two is
 * wholly clear at rest, which Android does not draw at all.
 *
 * The glass used to be a single colour taken from the controls' palette, which JavaScript moves a
 * step at a time. A thread that is busy takes those steps late and all at once, and the walk (v10)
 * saw the glass snap in one frame while the photograph dissolved under it.
 *
 * Nothing here is an ancestor of the blur: it sits beside it, as the plain fill always did, so the
 * blur is never under a fading view (Android loses it there).
 */
export function GlassFill({ strong = false }: { strong?: boolean }) {
  const mix = useThemeMix();
  const key = strong ? 'surfaceGlassStrong' : 'surfaceGlass';
  const day = useAnimatedStyle(() => ({ opacity: 1 - mix.get() }));
  const night = useAnimatedStyle(() => ({ opacity: mix.get() }));
  return (
    <>
      <Animated.View
        testID="glass-fill-day"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tokens.color.day[key] }, day]}
      />
      <Animated.View
        testID="glass-fill-night"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tokens.color.night[key] }, night]}
      />
    </>
  );
}
