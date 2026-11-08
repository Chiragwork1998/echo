import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import {
  configureNightLoopPlayer,
  NIGHT_LOOP_REVEAL_MS,
  NIGHT_LOOP_SOURCE,
  plateCoverRect,
} from '@/design/nightLoop';

type Size = { width: number; height: number };

/**
 * The living Night Home plate: a muted, looping, controls-free video laid exactly over the still
 * (see design/nightLoop). It is invisible until its first frame has rendered, so the still is never
 * covered by black or by a half-loaded picture, and it hands back to the still, with no error to
 * show, if the player ever fails. Not focusable, not touchable, hidden from screen readers.
 *
 * `revealMs` is how long it takes to appear once its first frame has rendered, and `revealAfterMs`
 * is the least time after the surface was made before it may begin. The welcome uses both; every
 * other time the loop appears in 700 ms, as soon as it can.
 *
 * This file imports expo-video directly. Reach it through NightHomeLoop, which keeps a build without
 * the native module on the still, and which decides when a player should exist at all.
 */
export function NightLoopSurface({
  playing,
  revealMs = NIGHT_LOOP_REVEAL_MS,
  revealAfterMs = 0,
}: {
  playing: boolean;
  revealMs?: number;
  revealAfterMs?: number;
}) {
  const player = useVideoPlayer(NIGHT_LOOP_SOURCE, configureNightLoopPlayer);
  const [frame, setFrame] = useState<Size | null>(null);
  const shown = useSharedValue(0);
  const [madeAt] = useState(() => Date.now());

  const reveal = useCallback(() => {
    const appear = withTiming(1, {
      duration: revealMs,
      easing: Easing.inOut(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
    // A first frame that is late has already waited: only what is left of the delay is waited.
    const wait = Math.max(0, revealAfterMs - (Date.now() - madeAt));
    shown.set(wait > 0 ? withDelay(wait, appear) : appear);
  }, [madeAt, revealAfterMs, revealMs, shown]);

  // Play and pause follow the caller exactly. Pausing keeps the frame, so resuming continues from
  // where the loop stopped, with no seek and no jump.
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  // A player that fails leaves the still as it was: back to the photograph, no message.
  useEffect(() => {
    const failed = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') {
        shown.set(
          withTiming(0, { duration: NIGHT_LOOP_REVEAL_MS, reduceMotion: ReduceMotion.Never }),
        );
      }
    });
    return () => failed.remove();
  }, [player, shown]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((now) => (now?.width === width && now.height === height ? now : { width, height }));
  }, []);

  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  // The still's own rectangle, measured from the box this fills, so tablets and landscape agree.
  const plate = frame ? plateCoverRect(frame) : null;

  return (
    <Animated.View
      style={[styles.root, fade]}
      onLayout={onLayout}
      pointerEvents="none"
      focusable={false}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="night-loop"
    >
      {plate && (
        <View style={[styles.plate, plate]} pointerEvents="none" focusable={false}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            // A TextureView on Android: it is an ordinary view, so the glass above blurs it (the
            // blur target draws its children, and a SurfaceView would draw as a hole), it fades and
            // stacks with the plates around it, and it never punches through the window.
            surfaceType="textureView"
            nativeControls={false}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
            startsPictureInPictureAutomatically={false}
            allowsVideoFrameAnalysis={false}
            controllerAutoShow={false}
            useExoShutter={false}
            pointerEvents="none"
            focusable={false}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onFirstFrameRender={reveal}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  plate: { position: 'absolute', overflow: 'hidden' },
});
