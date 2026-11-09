import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';
import {
  Easing,
  makeMutable,
  ReduceMotion,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { usePreferences } from '@/state/preferences';
import { qa } from '@/testing/qa';

import { mixColors } from './mixColor';
import { useThemeHeld } from './themeHold';
import { tokens, type ThemeColors, type ThemeName } from './tokens';
import { useReduceMotion } from './useReduceMotion';

export type ThemePreference = ThemeName | 'automatic';

type ThemeValue = {
  /**
   * The theme the controls are drawn in. During a change it flips as their colours pass the half
   * way mark, which is where the two plates are level: a heading that picks cream or ink by name
   * must not turn dark over a sky that is still Night.
   */
  name: ThemeName;
  colors: ThemeColors;
  /** The theme the person has asked for, which plates cross-fade toward from the first moment. */
  target: ThemeName;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /**
   * How much of Night there is in the things that tint rather than write (the glass): 1 is Night's
   * own, 0 is Day's. It moves on the UI thread, over the controls' colour time and after the same
   * wait, so a JavaScript thread that is busy cannot take its steps late and all at once, as it can
   * the colours above (see useShownTheme).
   */
  mix: SharedValue<number>;
};

const ThemeContext = createContext<ThemeValue | null>(null);

// A change of theme: the two plates cross-fade over 900 ms (EchoBackground), and the controls'
// colours move over 320 ms in the middle of that, where the two plates are at their most even. The
// name flips half way through those 320 ms, at 450 ms, when the plates are level. Reduce Motion:
// opacity only, and no more than 180 ms, with the name flipping at 90.
const CONTROLS_MS = tokens.motion.standard;
const LEAD_MS = (tokens.motion.atmosphere - CONTROLS_MS) / 2;
const REDUCED_MS = tokens.motion.fast;

type Shown = { name: ThemeName; colors: ThemeColors };
const rest = (name: ThemeName): Shown => ({ name, colors: tokens.color[name] });
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * The colours the controls show. At rest they are the theme's own tokens, the very same object. When
 * the theme changes they are mixed from the old to the new, and `name` flips half way through.
 */
function useShownTheme(target: ThemeName, animate: boolean): Shown {
  const reduced = useReduceMotion();
  const [shown, setShown] = useState<Shown>(() => rest(target));
  const latest = useRef(shown);
  useEffect(() => {
    latest.current = shown;
  });

  useEffect(() => {
    if (!animate) return;
    const { name, colors } = latest.current;
    if (name === target && colors === tokens.color[target]) return;
    const from = colors;
    const to = tokens.color[target];
    const lead = reduced ? 0 : LEAD_MS;
    const span = reduced ? REDUCED_MS : CONTROLS_MS;
    let frame: ReturnType<typeof requestAnimationFrame> | undefined;
    let started = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / span);
      setShown({
        name: t < 0.5 ? name : target,
        colors: t >= 1 ? to : mixColors(from, to, ease(t)),
      });
      if (t < 1) frame = requestAnimationFrame(step);
    };
    const begin = setTimeout(() => {
      started = Date.now();
      step();
    }, lead);
    return () => {
      clearTimeout(begin);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [target, animate, reduced]);

  return animate ? shown : rest(target);
}

/**
 * The mix of Night and Day for glass: a number the UI thread moves, on the schedule the controls'
 * colours keep (they wait LEAD_MS, and then move over CONTROLS_MS). A change that comes while it is
 * moving goes back from where it had reached.
 */
function useMixValue(target: ThemeName, animate: boolean): SharedValue<number> {
  const reduced = useReduceMotion();
  // Made outside the hooks that screens draw their own values with: the provider is above every
  // screen, and a value it took in their order would be the first any of them saw.
  const [mix] = useState(() => makeMutable(target === 'night' ? 1 : 0));
  // Nothing is changing when the provider first mounts.
  const begun = useRef(false);
  useEffect(() => {
    if (!begun.current) {
      begun.current = true;
      return;
    }
    const to = target === 'night' ? 1 : 0;
    if (!animate) {
      mix.set(to);
      return;
    }
    mix.set(
      withDelay(
        reduced ? 0 : LEAD_MS,
        withTiming(to, {
          duration: reduced ? REDUCED_MS : CONTROLS_MS,
          easing: Easing.inOut(Easing.quad),
          reduceMotion: ReduceMotion.Never,
        }),
      ),
    );
  }, [animate, mix, reduced, target]);
  return mix;
}

type ProviderProps = PropsWithChildren<{
  /**
   * Moves between themes over time. Tests turn it off, so that a change is complete the moment it
   * is made.
   */
  crossfade?: boolean;
}>;

export function ThemeProvider({ children, crossfade = true }: ProviderProps) {
  const system = useColorScheme();
  // Defaults to Night (D-001) and persists through the preferences store.
  const preference = usePreferences((state) => state.theme);
  const setPreference = usePreferences((state) => state.setTheme);
  const automatic: ThemeName = system === 'dark' ? 'night' : 'day';
  const wanted = qa.theme ?? (preference === 'automatic' ? automatic : preference);

  // Never in the middle of a writing session: the theme waits for it to close.
  const held = useThemeHeld();
  const [frozen, setFrozen] = useState(wanted);
  if (!held && frozen !== wanted) setFrozen(wanted);
  const target = held ? frozen : wanted;

  const { name, colors } = useShownTheme(target, crossfade);
  const mix = useMixValue(target, crossfade);
  const value = useMemo(
    () => ({ name, colors, target, preference, setPreference, mix }),
    [name, colors, target, preference, setPreference, mix],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** How much of Night there is in the glass, for a fill that tints (see GlassFill). */
export function useThemeMix(): SharedValue<number> {
  return useTheme().mix;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
