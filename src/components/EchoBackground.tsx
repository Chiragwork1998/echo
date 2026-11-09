import { Image } from 'expo-image';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { backgroundSources } from '@/design/generated/backgrounds';
import { plateScale, plateStep, usePlateFlow } from '@/design/plateMotion';
import {
  lastShownPlate,
  noteShownPlate,
  PLATE_HELD_OPACITY,
  PLATE_LATE_MS,
  PosterShownContext,
  releaseShownPlate,
  usePlateTicket,
} from '@/design/platePaint';
import { useTheme } from '@/design/theme';
import { tokens, type ThemeName } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import type { ScreenId } from '@/features/onboarding/flow';

const GLIDE = Easing.inOut(Easing.cubic);
const AnimatedImage = Animated.createAnimatedComponent(Image);

type PlateEvents = { onShown?: () => void; onFailed?: () => void };

/** One plate, drawn with cover and centred. Plates are never tinted, overlaid or blended. */
function Plate({
  screen,
  theme,
  veil = false,
  style,
  onShown,
  onFailed,
}: { screen: ScreenId; theme: ThemeName; veil?: boolean; style?: object } & PlateEvents) {
  return (
    <AnimatedImage
      {...(veil ? { testID: 'veil' } : {})}
      source={backgroundSources[theme][screen]}
      style={[StyleSheet.absoluteFill, style]}
      contentFit="cover"
      contentPosition="center"
      transition={0}
      onLoad={onShown}
      onDisplay={onShown}
      onError={onFailed}
    />
  );
}

/**
 * The art-directed plate for a screen. Plates are fully graded: per their export contract they are
 * centred, drawn with cover, and never tinted, overlaid, or blended at runtime. Two things move it:
 *
 * - Onboarding. The plate scales as the journey goes forward and back (see plateMotion), so that the
 *   native cross-dissolve between screens carries a slow drift: the plate being left grows to 1.025
 *   as it fades, and the next one settles from 0.985. Reduce Motion drops the scale and keeps the
 *   fade.
 * - Theme. A change of theme cross-fades the two complete plates over 900 ms (180 ms with Reduce
 *   Motion). The plate is never blended with a colour: one image simply gives way to the other. Day
 *   lies beneath and Night over it, and one value, how much of Night there is, carries the pair, so a
 *   change that is reversed in the middle goes back from where it had reached and never jumps.
 *
 * - Arrival. A plate is a large photograph and takes some time to decode when its screen mounts. A
 *   screen that has just been reached therefore holds up the plate that was last on show, beneath its
 *   own, until its own has been drawn, and then brings its own up over it. A screen never shows a flat
 *   colour where its photograph should be. A plate that was to hand at once simply replaces the old
 *   one, as it always did, unless it is told to come up (`comesUp`), and a screen that wears the same
 *   plate holds nothing up (see platePaint).
 *   That is the copy a plate holds up for itself, inside the picture the glass blurs. Beneath all of
 *   it, and beneath the whole navigator, the plate backing draws the plate that was last on show, and
 *   this draws no colour of its own: so wherever the held copy is not drawn either, which is whenever
 *   the screen that had it has gone, the photograph is still the one that was there. A plate reports
 *   itself to the backing once it is wholly up (not while it is still coming up over the old one,
 *   which would leave nothing to see come up), and again when its screen goes.
 *
 * `overlay` belongs to Night and travels with it: it is how Night Home comes alive (D-009). The loop
 * lies over the still, in the same fading group, so it fades with the plate it is part of and the
 * still beneath is the poster until the loop's first frame. At rest only one plate is mounted.
 */
export function EchoBackground({
  screen,
  overlay,
  comesUp = false,
}: {
  screen: ScreenId;
  overlay?: ReactNode;
  /**
   * Its own plate always comes up over the one it holds, by the arrival's fade, even when it is to hand
   * at once. Read once, as the plate first appears. For Home's first look after onboarding, which follows
   * Completion's photograph, and must not cut from it to Home's.
   */
  comesUp?: boolean;
}) {
  const { target } = useTheme();
  const reduced = useReduceMotion();
  const [alwaysComesUp] = useState(comesUp);

  const own = plateStep(screen);
  const flow = usePlateFlow((state) => state.step);
  const scaleTarget = reduced ? 1 : plateScale(own, flow);
  // Starts where the journey says it should be, so a plate that arrives is already at 0.985.
  const scale = useSharedValue(scaleTarget);
  useEffect(() => {
    scale.set(
      withTiming(scaleTarget, {
        duration: tokens.motion.screen,
        easing: GLIDE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [scale, scaleTarget]);
  const drift = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  // How much of Night there is: 1 is the Night plate, whole, over Day; 0 is Day alone.
  const night = useSharedValue(target === 'night' ? 1 : 0);
  // The theme alone on the screen. Null while a change is under way, and both plates are drawn.
  const [settled, setSettled] = useState<ThemeName | null>(target);
  if (settled !== null && settled !== target) setSettled(null);
  const fadeMs = reduced ? tokens.motion.fast : tokens.motion.atmosphere;
  // Nothing is changing when the plate first appears, so the first run starts no fade and no timer.
  const changing = useRef(false);
  useEffect(() => {
    if (!changing.current) {
      changing.current = true;
      return;
    }
    night.set(
      withTiming(target === 'night' ? 1 : 0, {
        duration: fadeMs,
        easing: GLIDE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
    const done = setTimeout(() => setSettled(target), fadeMs);
    return () => clearTimeout(done);
  }, [fadeMs, night, target]);
  const nightStyle = useAnimatedStyle(() => ({ opacity: night.get() }));

  // The plate that was on show before this screen, held beneath its own until its own is drawn.
  const [veil, setVeil] = useState<ScreenId | null>(() => {
    const last = lastShownPlate();
    return last && last.theme === target && last.screen !== screen ? last.screen : null;
  });
  // Its own plate stays hidden while the old one is held, then comes up over it.
  const arrival = useSharedValue(veil === null ? 1 : PLATE_HELD_OPACITY);
  const arrivalStyle = useAnimatedStyle(() => ({ opacity: arrival.get() }));
  const [madeAt] = useState(() => Date.now());
  const awaited = usePlateTicket();
  // This plate's name among the plates that are on show (see platePaint).
  const owner = useId();
  // The theme that is wanted now: a plate that is drawn in the other one is not the plate on show.
  const wanted = useRef(target);
  useEffect(() => {
    wanted.current = target;
  }, [target]);
  const [posterShown, setPosterShown] = useState(false);
  const veiled = useRef(veil !== null);
  const releasing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const veilMs = reduced ? tokens.motion.fast : tokens.motion.standard;
  useEffect(
    () => () => {
      if (releasing.current !== undefined) clearTimeout(releasing.current);
    },
    [],
  );
  // The screen is left: the plate that is on show is whichever is beneath it.
  useEffect(() => () => releaseShownPlate(owner), [owner]);

  const letGo = useCallback(() => {
    veiled.current = false;
    setVeil(null);
  }, []);

  // Wholly up: this screen's plate, in the theme that is wanted, is now the one that is on show.
  const present = useCallback(
    (theme: ThemeName) => {
      if (theme === wanted.current) noteShownPlate(owner, theme, screen);
    },
    [owner, screen],
  );

  // Drawn. Over a held plate it comes up softly if it was late, or if it is told to, and at once if not,
  // and it is the plate on show once it has come up.
  const shown = useCallback(
    (theme: ThemeName) => {
      awaited();
      if (theme === 'night') setPosterShown(true);
      if (!veiled.current) {
        present(theme);
        return;
      }
      if (alwaysComesUp || Date.now() - madeAt > PLATE_LATE_MS) {
        arrival.set(
          withTiming(1, { duration: veilMs, easing: GLIDE, reduceMotion: ReduceMotion.Never }),
        );
        veiled.current = false;
        releasing.current = setTimeout(() => {
          setVeil(null);
          present(theme);
        }, veilMs);
        return;
      }
      arrival.set(1);
      letGo();
      present(theme);
    },
    [alwaysComesUp, arrival, awaited, letGo, madeAt, present, veilMs],
  );
  // Nothing is held for a photograph that cannot be drawn: what is beneath is not its own, and is let go.
  const failed = useCallback(() => {
    awaited();
    arrival.set(1);
    letGo();
  }, [arrival, awaited, letGo]);
  // A change of theme has its own cross-fade between two whole plates, and holds nothing.
  if (veil !== null && settled !== target) setVeil(null);
  // However the old plate came to be let go, its own is then wholly there.
  useEffect(() => {
    if (veil === null) arrival.set(1);
  }, [arrival, veil]);
  const onDay = useCallback(() => shown('day'), [shown]);
  const onNight = useCallback(() => shown('night'), [shown]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Animated.View testID="drift" style={[StyleSheet.absoluteFill, drift]}>
        {settled !== 'night' && (
          <>
            {veil && <Plate veil screen={veil} theme="day" />}
            <Plate
              screen={screen}
              theme="day"
              style={arrivalStyle}
              onShown={onDay}
              onFailed={failed}
            />
          </>
        )}
        {settled !== 'day' && (
          // Android fades a group's children one by one unless it is told they are one picture, and
          // the loop over the still would then show the still through itself.
          <Animated.View
            style={[StyleSheet.absoluteFill, nightStyle]}
            needsOffscreenAlphaCompositing
          >
            {veil && <Plate veil screen={veil} theme="night" />}
            <Plate
              screen={screen}
              theme="night"
              style={arrivalStyle}
              onShown={onNight}
              onFailed={failed}
            />
            <PosterShownContext.Provider value={posterShown}>{overlay}</PosterShownContext.Provider>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}
