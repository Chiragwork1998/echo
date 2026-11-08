import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

/**
 * What an arrival tells the glass inside it. Android's BlurView loses its blur while any ancestor's
 * opacity is under 1, and shows a pale slab with no frost until the fade is over. So nothing that
 * arrives (a Rise, a skeleton's Bars, a skeleton leaving) may fade over a piece of glass: it
 * keeps itself at full opacity once the glass is in it, and the glass, which can see the arrival
 * here, fades only what is written on it.
 */
export type Arrival = {
  /** How far the arrival has come, 0 to 1. The words on the glass follow it. */
  fade: SharedValue<number>;
  /** Called by glass that finds itself inside: the arrival then keeps its own opacity at 1. */
  sawGlass: () => void;
};

export const ArrivalContext = createContext<Arrival | null>(null);

/**
 * What a fading view needs to take care of the glass inside it: the arrival to give it, and whether
 * glass has said it is there. With glass in it, the view keeps its own opacity at 1 (or, if it is
 * still hidden, switches on at once) and only what is written on the glass fades with `fade`.
 */
export function useGlassAware(fade: SharedValue<number>) {
  const [glass, setGlass] = useState(false);
  const arrival = useMemo<Arrival>(() => ({ fade, sawGlass: () => setGlass(true) }), [fade]);
  return { glass, arrival };
}

/**
 * The opacity of a view that arrives, from how far the arrival has come (0 to 1). With glass in it
 * the view is whole from the moment it moves and hidden before that, and only what is written on the
 * glass fades; without, it fades itself. The view has one animated style for its whole life and this
 * is what it reads: a view that is given a different animated style after it has mounted is drawn
 * with none of the new style's first values, which is full opacity, for a frame (the walk, v9: glass
 * seen empty, gone, then back with its words).
 */
export function arrivalOpacity(progress: number, glass: boolean): number {
  'worklet';
  if (!glass) return progress;
  return progress > 0 ? 1 : 0;
}

function Faded({
  fade,
  style,
  children,
}: PropsWithChildren<{ fade: SharedValue<number>; style?: StyleProp<ViewStyle> }>) {
  const opacity = useAnimatedStyle(() => ({ opacity: fade.get() }));
  return (
    <Animated.View style={[style, opacity]}>
      {/* What is on the glass is not the arrival itself: glass inside glass would fade twice. */}
      <ArrivalContext.Provider value={null}>{children}</ArrivalContext.Provider>
    </Animated.View>
  );
}

/**
 * What is written on a piece of glass: its words, its rows, its controls. Under an arrival it tells
 * the arrival that glass is here, and fades with it while the glass itself stays whole. Anywhere
 * else it is just the children (in a view of their own when `wrap`, or when given a style).
 */
export function OnGlass({
  style,
  wrap = false,
  children,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; wrap?: boolean }>): ReactNode {
  const arrival = useContext(ArrivalContext);
  const sawGlass = arrival?.sawGlass;
  useLayoutEffect(() => sawGlass?.(), [sawGlass]);
  if (arrival) {
    return (
      <Faded fade={arrival.fade} style={style}>
        {children}
      </Faded>
    );
  }
  return wrap || style ? <View style={style}>{children}</View> : <>{children}</>;
}
