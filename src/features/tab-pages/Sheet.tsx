import { LinearGradient } from 'expo-linear-gradient';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type KeyboardEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EchoModal } from '@/components/EchoModal';
import { EchoText } from '@/components/EchoText';
import { EASE } from '@/design/ease';
import { cue } from '@/design/haptics';
import { parseColor } from '@/design/mixColor';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { qaKeyboardHeight } from '@/features/journal-session/sky';
import { useTone } from '@/features/onboarding/rhythm/tone';

import { keepTogether } from './keepTogether';
import { detail, question, textAction } from './textStyles';

const MAX_WIDTH = 430;
const SIDE = tokens.space[12];

// Paper arriving: the sheet lands fast and settles slowly, as a page set down does. EASE has gone
// 87 percent of the way by 180 ms, so the 520 ms is mostly the last few points coming to rest.
const SCRIM_IN_MS = 320;
const SHEET_RISE_MS = 520;
// Shorter than the rise: while the cloth is still see-through the page's own words show through the
// sheet's, so the cloth is whole within about a hundred milliseconds and only the travel is slow.
const SHEET_FADE_IN_MS = 120;
const RISE = 24;
// It leaves quicker and lower than it came: set down, then lifted away.
const SHEET_OUT_MS = 240;
const SCRIM_OUT_MS = 260;
const SINK = 12;
/**
 * The window outlasts its own exit, so it is still there to see (and still counted) while it fades.
 * It ends when the scrim has been seen to reach nothing, never when a clock says it should have: a
 * screen busy with the page behind (a draft kept, a screen changing) draws the fade late, and a
 * window taken away by the clock would take the sheet from the glass whole. This is only how long
 * it waits for that word before ending the window anyway, so none can be left behind, invisible,
 * and swallowing touches.
 */
const UNMOUNT_CAP_MS = 1200;
/**
 * The window is made by the system after the commit and laid out at no size until it has its own, so
 * the sheet does not begin to arrive until its window has said what size it is: an arrival timed from
 * the commit is half spent, or over, when the window is first drawn (the walk, v10: a dialog first
 * seen opaque and 68 dp above its place, another faint, the Support sheet whole with its scrim). This
 * is only how long it waits for that word before arriving anyway, so no sheet is left invisible.
 */
const LAYOUT_WAIT_MS = 400;
/** Two heights this close, in points, are the same: a layout's rounding to the pixel. */
const SAME_SIZE = 1;
/**
 * The window outlasts a keyboard that it raised by this much after the keyboard has said it is gone.
 * The system goes on putting the keyboard away for a while after it has been seen to go, and a window
 * taken away meanwhile gave it back to the screen beneath, whole, for two frames (the walk, v11: on You,
 * after a name was written).
 */
export const KEYS_SETTLE_MS = 300;
// Reduce Motion: the sheet and the scrim fade, and nothing travels.
const REDUCED_IN_MS = tokens.motion.fast;
const REDUCED_OUT_MS = 140;
/** The sheet clears the keyboard by this much, as it clears the safe edge by this much at rest. */
const KEYBOARD_GAP = tokens.space[8];
const KEYBOARD_MS = 220;
/** A dialog handing over to the next one: the new words fade in on the same sheet. */
const HANDOFF_MS = 200;

const nothing = () => undefined;

/**
 * Whether a layout of a sheet's window is the window at its own size, so that the sheet may begin to
 * arrive. Android lays a Modal out first at a size worked out from the app's window less the bars it
 * knows of, and again at its real size once the system has made the window, which is edge to edge: the
 * whole of the app's window (the walk, v11: 840 points, then 914; a sheet that began to arrive on the
 * first was drawn some 50 points above its place, then dropped 74). There a layout is the real one when
 * it is as tall as the app's window, or when it follows one of another height. The keyboard changes
 * neither: the stage makes room for the keys inside itself. Elsewhere the first layout is the real one.
 */
function ownSize(height: number, first: number | null): boolean {
  if (Platform.OS !== 'android') return true;
  if (Math.abs(height - Dimensions.get('window').height) <= SAME_SIZE) return true;
  return first !== null && Math.abs(height - first) > SAME_SIZE;
}

/**
 * The action that was chosen keeps the look of being pressed while the sheet leaves. A sheet that
 * comes back during its exit forgets the choice, so it cannot colour the next way out.
 */
function useHeldWhileLeaving() {
  const leaving = useContext(LeavingContext);
  const [chosen, setChosen] = useState(false);
  const [was, setWas] = useState(leaving);
  if (leaving !== was) {
    setWas(leaving);
    if (!leaving) setChosen(false);
  }
  return { held: leaving && chosen, choose: () => setChosen(true) };
}

/** True while the sheet is on its way out: its buttons hold the look they were pressed with. */
const LeavingContext = createContext(false);

type Props = PropsWithChildren<{
  visible: boolean;
  /** The system Back button, Escape, and a tap outside the sheet. */
  onClose: () => void;
  /** Always in view beneath the part that scrolls: the sheet's actions. */
  footer?: ReactNode;
  /** False to go at once instead of arriving, as when the lock takes the screen: nothing fades over it. */
  animated?: boolean;
  /**
   * Names what the sheet says now. When it changes while the sheet is open, the sheet stays where it
   * is and its words fade in, rather than rising again.
   */
  contentKey?: string | number;
  /** Names the sheet's window, where Back arrives. The dimmed page around it is `${testID}-outside`. */
  testID?: string;
}>;

/** The sheet's words and actions, fading in when they replace others on a sheet already open. */
function Presented({ fade, children }: PropsWithChildren<{ fade: boolean }>) {
  const reduced = useReduceMotion();
  const shown = useSharedValue(fade ? 0 : 1);
  useEffect(() => {
    if (!fade) return;
    shown.set(
      withTiming(1, {
        duration: reduced ? tokens.motion.fast : HANDOFF_MS,
        easing: EASE,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [fade, reduced, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return <Animated.View style={[styles.presented, style]}>{children}</Animated.View>;
}

/**
 * A sheet over the page, in the same cloth as the voice consent sheet: cream with ink by Day,
 * midnight with cream by Night, a fine edge and no shadow. It arrives like paper set down: the page
 * dims over 320 ms while the sheet rises 24 pt and settles, and it leaves a little quicker. Content
 * and buttons are live from the first frame. Under Reduce Motion it only fades. The person never
 * loses their place beneath it.
 */
export function Sheet({
  visible,
  onClose,
  footer,
  animated = true,
  contentKey,
  children,
  testID,
}: Props) {
  const tone = useTone();
  const reduced = useReduceMotion();
  const { bottom } = useSafeAreaInsets();
  // The consent sheet's cloth, made whole: nothing of the page should read through a sheet.
  const rgb = parseColor(tone.sheet);
  const cloth = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : tone.sheet;

  // The window stays up for the length of its exit. A timer ends it, never an animation callback.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  // With no animation there is no exit to wait for: the window is simply gone, and stays gone if
  // animation comes back (the lock lets go) before anything has opened it again.
  if (!visible && !animated && mounted) setMounted(false);
  const present = animated ? mounted : visible;
  const leaving = present && !visible;

  // The window has been laid out at a size of its own (see LAYOUT_WAIT_MS and ownSize). Each window
  // starts without, and with no first height.
  const [placed, setPlaced] = useState(false);
  if (!present && placed) setPlaced(false);
  const firstHeight = useRef<number | null>(null);
  const onStageLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width <= 0 || layout.height <= 0) return;
    if (ownSize(layout.height, firstHeight.current)) setPlaced(true);
    firstHeight.current ??= layout.height;
  }, []);

  // What the sheet says is what it said when it left: the words and the actions that were on it are
  // not changed, added to or taken from, while it fades. A name written as the sheet closes brings an
  // action with it, and a sheet that grows as it goes jumps (the walk, v10: about 120 px).
  const said = useRef({ children, footer });
  useLayoutEffect(() => {
    if (visible) said.current = { children, footer };
  });
  const { children: body, footer: actions } = leaving ? said.current : { children, footer };

  const [shownKey, setShownKey] = useState(contentKey);
  const [handoff, setHandoff] = useState(false);
  if (contentKey !== shownKey) {
    setShownKey(contentKey);
    setHandoff(mounted && visible);
  }

  const rest = visible && !animated;
  const dim = useSharedValue(rest ? 1 : 0);
  const fade = useSharedValue(rest ? 1 : 0);
  const y = useSharedValue(rest || reduced ? 0 : RISE);
  const wasVisible = useRef(visible);
  // The window goes once its scrim has been seen to reach nothing, and once a keyboard it raised has
  // gone (see KEYS_SETTLE_MS). An answer from an exit that has since been undone (the sheet is back)
  // is not the window's to act on.
  const ending = useRef({ faded: false, keysAway: false });
  const end = useCallback(() => {
    if (wasVisible.current) return;
    setHandoff(false);
    setMounted(false);
  }, []);
  const exited = useCallback(() => {
    ending.current.faded = true;
    if (ending.current.keysAway) end();
  }, [end]);
  const keysAway = useCallback(() => {
    ending.current.keysAway = true;
    if (ending.current.faded) end();
  }, [end]);

  useEffect(() => {
    const was = wasVisible.current;
    wasVisible.current = visible;
    const hide = () => {
      dim.set(0);
      fade.set(0);
      y.set(reduced ? 0 : RISE);
    };
    if (visible) {
      // Whatever went before, the next exit has neither faded nor seen any keyboard go.
      ending.current = { faded: false, keysAway: false };
      if (!animated) {
        dim.set(1);
        fade.set(1);
        y.set(0);
        return;
      }
      // Its start state is what the window is first drawn with, and it arrives once it has a size.
      if (!placed) return;
      const options = { reduceMotion: ReduceMotion.Never };
      dim.set(
        withTiming(1, {
          ...options,
          duration: reduced ? REDUCED_IN_MS : SCRIM_IN_MS,
          easing: Easing.out(Easing.quad),
        }),
      );
      fade.set(
        withTiming(1, {
          ...options,
          duration: reduced ? REDUCED_IN_MS : SHEET_FADE_IN_MS,
          easing: Easing.out(Easing.cubic),
        }),
      );
      // Starts from wherever an exit in progress had got to, so a quick re-open never jumps.
      y.set(withTiming(0, { ...options, duration: reduced ? 0 : SHEET_RISE_MS, easing: EASE }));
      return;
    }
    if (!was) return;
    if (!animated) {
      hide();
      return;
    }
    const options = { reduceMotion: ReduceMotion.Never };
    fade.set(
      withTiming(0, {
        ...options,
        duration: reduced ? REDUCED_OUT_MS : SHEET_OUT_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
    dim.set(
      withTiming(
        0,
        {
          ...options,
          duration: reduced ? REDUCED_OUT_MS : SCRIM_OUT_MS,
          easing: Easing.out(Easing.quad),
        },
        (finished) => {
          'worklet';
          // False when the sheet came back and cut the fade short: that exit was never finished.
          if (finished) runOnJS(exited)();
        },
      ),
    );
    if (!reduced) {
      y.set(
        withTiming(SINK, { ...options, duration: SHEET_OUT_MS, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [animated, dim, exited, fade, placed, reduced, visible, y]);

  // A window that never says what size it is arrives anyway, a little late.
  useEffect(() => {
    if (!visible || !animated || !present || placed) return;
    const late = setTimeout(() => setPlaced(true), LAYOUT_WAIT_MS);
    return () => clearTimeout(late);
  }, [animated, placed, present, visible]);

  // The window's last word, if the fade or the keyboard never reports. It lives in its own effect so
  // that anything that changes during the exit (the lock engaging, Reduce Motion) re-arms it rather
  // than leaving a window that is invisible, full screen, and swallowing touches.
  useEffect(() => {
    if (visible || !mounted) return;
    const done = setTimeout(end, UNMOUNT_CAP_MS);
    return () => clearTimeout(done);
  }, [end, visible, mounted, reduced]);

  // Once the window is gone the next opening starts from nothing.
  useEffect(() => {
    if (mounted) return;
    firstHeight.current = null;
    dim.set(0);
    fade.set(0);
    y.set(reduced ? 0 : RISE);
  }, [dim, fade, mounted, reduced, y]);

  const scrim = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const paper = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: [{ translateY: y.get() }],
  }));
  /** The sheet's own distance from the bottom edge: the safe edge, and a little more. */
  const resting = Math.max(bottom, SIDE) + tokens.space[8];

  return (
    // Nothing the window itself is told changes while it is open, however the sheet changes: every
    // update to a Modal on Android runs its window through a pass of its own, and a window put
    // through one as the sheet leaves is one that can blink. The sheet's name is on what is inside.
    <EchoModal
      transparent
      animationType="none"
      visible={present}
      // A window on its way out is no longer the sheet: Back does nothing.
      onRequestClose={leaving ? nothing : onClose}
    >
      <LeavingContext.Provider value={leaving}>
        <View testID={leaving ? undefined : testID} style={styles.window}>
          <Stage
            testID={testID}
            leaving={leaving}
            bottom={bottom}
            resting={resting}
            onLayout={onStageLayout}
            onKeysAway={keysAway}
          >
            <Animated.View
              testID={testID && `${testID}-scrim`}
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.dim, scrim]}
            />
            <Pressable
              testID={testID && `${testID}-outside`}
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessible={false}
              importantForAccessibility="no"
            />
            <Animated.View
              testID={testID && `${testID}-paper`}
              accessibilityViewIsModal
              onAccessibilityEscape={onClose}
              style={[
                styles.sheet,
                { backgroundColor: cloth, borderColor: tone.edge, marginBottom: resting },
                paper,
              ]}
            >
              <Presented key={contentKey} fade={handoff}>
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.body}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {body}
                </ScrollView>
                {actions ? <View style={styles.footer}>{actions}</View> : null}
              </Presented>
            </Animated.View>
          </Stage>
        </View>
      </LeavingContext.Provider>
    </EchoModal>
  );
}

/**
 * How much of the screen the keyboard has, from the bottom edge, in points, as it comes and goes.
 * Only while the sheet's window is there to be moved: the window is a window of its own, and the
 * keyboard is reported by the screen it is above.
 *
 * `frozen` while the sheet leaves: the keyboard is still reported, and remembered, but the room does
 * not follow it, so nothing is laid out again under a sheet that is fading (the walk, v10: it jumped).
 * The room catches up if the sheet comes back. `up` says whether the keyboard is raised right now.
 */
function useKeyboardRoom(frozen: boolean): { room: SharedValue<number>; up: () => boolean } {
  const room = useSharedValue(0);
  const latest = useRef(0);
  const held = useRef(frozen);
  const go = useCallback(
    (height: number, duration?: number) => {
      latest.current = height;
      if (held.current) return;
      room.set(
        withTiming(height, {
          duration: duration || KEYBOARD_MS,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.Never,
        }),
      );
    },
    [room],
  );
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shown = (event: KeyboardEvent) => {
      const { height, screenY } = event.endCoordinates;
      // iOS changes the keyboard's frame to take it away, too: below the screen is gone.
      go(ios && screenY >= Dimensions.get('window').height ? 0 : height, event.duration);
    };
    const hidden = (event?: KeyboardEvent) => go(0, event?.duration);
    const subscriptions = ios
      ? [
          Keyboard.addListener('keyboardWillChangeFrame', shown),
          Keyboard.addListener('keyboardWillHide', hidden),
        ]
      : [
          Keyboard.addListener('keyboardDidShow', shown),
          Keyboard.addListener('keyboardDidHide', hidden),
        ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [go]);
  useEffect(() => {
    const was = held.current;
    held.current = frozen;
    if (was && !frozen) go(latest.current);
  }, [frozen, go]);
  const up = useCallback(() => latest.current > 0, []);
  return { room, up };
}

/**
 * The sheet's ground: the whole window, the sheet at its foot. The sheet is its own window, where
 * the page's keyboard handling cannot reach, so the ground gives way to the keyboard itself, and the
 * sheet, and its buttons, ride up above it. A sheet taller than what is left scrolls inside. When the
 * sheet leaves, the keyboard it raised is put away first (it would otherwise stay up over the page
 * for as long as the system takes to notice that its window has gone), and the ground stays put.
 * `onKeysAway` says when the window no longer has a keyboard to wait for (see KEYS_SETTLE_MS).
 */
function Stage({
  testID,
  leaving,
  bottom,
  resting,
  onLayout,
  onKeysAway,
  children,
}: PropsWithChildren<{
  testID?: string;
  leaving: boolean;
  bottom: number;
  resting: number;
  onLayout: (event: LayoutChangeEvent) => void;
  onKeysAway: () => void;
}>) {
  const { room, up } = useKeyboardRoom(leaving);
  // Only a keyboard that this window raised: the page behind may have one of its own, and a sheet
  // that closes (Keep your draft?) hands the screen back to it.
  useEffect(() => {
    if (!leaving) return;
    if (!up()) {
      onKeysAway();
      return;
    }
    let settle: ReturnType<typeof setTimeout> | undefined;
    const gone = Keyboard.addListener('keyboardDidHide', () => {
      clearTimeout(settle);
      settle = setTimeout(onKeysAway, KEYS_SETTLE_MS);
    });
    Keyboard.dismiss();
    return () => {
      gone.remove();
      clearTimeout(settle);
    };
  }, [leaving, onKeysAway, up]);
  // Android reports the keyboard without the navigation bar it also covers.
  const under = Platform.OS === 'android' ? bottom : 0;
  // The visual harness has no keyboard, so it reserves the room of one by name. That is a plain
  // function, and the worklet below runs on the UI thread, where a function that is not a worklet
  // does not exist (calling it kills the app): it is read here, as the sheet is drawn, and the worklet
  // is given the number.
  const reserved = qaKeyboardHeight();
  const ground = useAnimatedStyle(() => {
    const height = Math.max(room.get(), reserved);
    return {
      paddingBottom: height <= 0 ? 0 : Math.max(0, height + under + KEYBOARD_GAP - resting),
    };
  });
  return (
    <Animated.View
      testID={testID && `${testID}-stage`}
      onLayout={onLayout}
      style={[styles.stage, ground]}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
    >
      {children}
    </Animated.View>
  );
}

/** A sheet's heading: Cormorant, in the sheet's ink. */
export function SheetTitle({ children }: { children: string }) {
  const tone = useTone();
  return (
    <EchoText
      variant="bodyL"
      accessibilityRole="header"
      accessibilityLabel={children}
      maxFontSizeMultiplier={1.5}
      style={[question, { color: tone.ink }]}
    >
      {keepTogether(children)}
    </EchoText>
  );
}

/** A sheet's running text. `soft` for the quieter second voice. */
export function SheetText({ children, soft }: { children: string; soft?: boolean }) {
  const tone = useTone();
  return (
    <EchoText
      variant="bodyM"
      maxFontSizeMultiplier={1.6}
      style={[detail, { color: soft ? tone.inkSoft : tone.ink }]}
    >
      {keepTogether(children)}
    </EchoText>
  );
}

const CREAM_STOPS = ['#FBF8F2', '#EDE6DC'] as const; // tokens.gradient.creamButton

/**
 * The sheet's one primary action, at the CTA's geometry: 56 pt, fully rounded, the width of the
 * sheet. Cream with ink by Night, as every primary action is; by Day the sheet itself is cream, so
 * the button is ink with cream type, the same two colours turned over.
 */
export function SheetButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  hint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Read when it is disabled: what is needed first. */
  hint?: string;
}) {
  const { name, colors } = useTheme();
  const { held, choose } = useHeldWhileLeaving();
  const day = name === 'day';
  const blocked = disabled || busy;
  const labelColour = day ? colors.textPrimary : colors.textInk;
  const caption = (
    <EchoText
      variant="label"
      numberOfLines={1}
      maxFontSizeMultiplier={1.4}
      style={{ color: labelColour }}
    >
      {label}
    </EchoText>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? hint : undefined}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={() => {
        // A sheet's primary action is the one that confirms: felt once, as it begins.
        cue('commit');
        choose();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        blocked && styles.blocked,
        (pressed || held) && styles.buttonPressed,
      ]}
    >
      {day ? (
        <View style={[styles.fill, { backgroundColor: colors.textInk }]}>{caption}</View>
      ) : (
        <LinearGradient
          colors={CREAM_STOPS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
        >
          {caption}
        </LinearGradient>
      )}
    </Pressable>
  );
}

/** A quiet word to tap inside a sheet, such as Cancel. Sentence case, 44 pt tall. */
export function SheetAction({ label, onPress }: { label: string; onPress: () => void }) {
  const tone = useTone();
  const { held, choose } = useHeldWhileLeaving();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        choose();
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => [styles.action, (pressed || held) && styles.pressed]}
    >
      <EchoText
        variant="bodyM"
        maxFontSizeMultiplier={1.5}
        style={[textAction, { color: tone.ink }]}
      >
        {label}
      </EchoText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1 },
  stage: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SIDE,
  },
  dim: { backgroundColor: 'rgba(3,11,22,0.5)' },
  // Shrinks with the sheet's own maximum height, so a long body scrolls above its footer.
  presented: { flexShrink: 1 },
  sheet: {
    width: '100%',
    maxWidth: MAX_WIDTH - SIDE * 2,
    maxHeight: '86%',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scroll: { flexGrow: 0 },
  body: {
    gap: tokens.space[12],
    paddingHorizontal: tokens.space[24],
    paddingTop: tokens.space[24],
    paddingBottom: tokens.space[8],
  },
  footer: {
    alignItems: 'stretch',
    gap: tokens.space[4],
    paddingHorizontal: tokens.space[16],
    paddingTop: tokens.space[12],
    paddingBottom: tokens.space[8],
  },
  action: { minHeight: tokens.size.tapTarget, justifyContent: 'center', alignSelf: 'center' },
  pressed: { opacity: 0.6 },
  button: {
    height: tokens.size.primaryButtonHeight,
    borderRadius: tokens.radius.button,
    overflow: 'hidden',
  },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  blocked: { opacity: 0.42 },
  buttonPressed: { transform: [{ scale: 0.985 }] },
});
