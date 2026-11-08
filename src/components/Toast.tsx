import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { EASE } from '@/design/ease';
import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';
import { qa } from '@/testing/qa';

import { EchoText } from './EchoText';

// Long enough to read the line and to hear it, short enough to stay out of the way: 48 ms a
// character on top of a beat, never under 2.2 seconds and never over 4.2.
const DWELL_MIN_MS = 2200;
const DWELL_MAX_MS = 4200;
const DWELL_BEAT_MS = 1400;
const DWELL_PER_CHARACTER_MS = 48;
/** How long a line stays, once it has arrived. */
export const dwellFor = (message: string): number =>
  Math.min(
    DWELL_MAX_MS,
    Math.max(DWELL_MIN_MS, DWELL_BEAT_MS + DWELL_PER_CHARACTER_MS * message.length),
  );
// It arrives from just below and settles; it leaves by lifting a little, as breath leaves.
const RISE = 10;
const LIFT = -6;
const FADE_IN_MS = 240;
const FADE_OUT_MS = 320;
const MOVE_MS = 480;
/**
 * Clear of the primary CTA and of the tab bar. The CTA is 56 pt tall and sits 18 pt above the safe
 * bottom, so it ends 74 pt up. The Night tab bar ends 83 pt up. The toast rests above both.
 */
const ABOVE_SAFE_BOTTOM = 88;

type ToastState = { toast: { id: number; message: string } | null };
const useToasts = create<ToastState>(() => ({ toast: null }));
let nextId = 0;

/**
 * Says one short, quiet line. A newer toast replaces the one showing. Keep it to words about the
 * app's own state: never anything the person wrote.
 */
export function showToast(message: string): void {
  useToasts.setState({ toast: { id: ++nextId, message } });
}

// The visual harness says its own lines through this. `qa.enabled` is only ever true there.
if (qa.enabled) (window as unknown as { __echoToast?: typeof showToast }).__echoToast = showToast;

/** Removes the toast now. Tests use it to start clean. */
export function clearToast(): void {
  useToasts.setState({ toast: null });
}

function dismiss(id: number) {
  if (useToasts.getState().toast?.id === id) useToasts.setState({ toast: null });
}

function ToastView({ id, message }: { id: number; message: string }) {
  const { colors } = useTheme();
  const { width, gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const reduced = useReduceMotion();
  const shown = useSharedValue(0);
  const y = useSharedValue(reduced ? 0 : RISE);

  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(message);
    // Reduce Motion: the line fades and nothing travels, in no more than a button press.
    const inMs = reduced ? tokens.motion.fast : MOVE_MS;
    const outMs = reduced ? tokens.motion.fast : MOVE_MS;
    const never = { reduceMotion: ReduceMotion.Never };
    shown.set(
      withTiming(1, {
        ...never,
        duration: reduced ? tokens.motion.fast : FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
    if (!reduced) y.set(withTiming(0, { ...never, duration: MOVE_MS, easing: EASE }));
    const leaveAt = inMs + dwellFor(message);
    const leave = setTimeout(() => {
      shown.set(
        withTiming(0, {
          ...never,
          duration: reduced ? tokens.motion.fast : FADE_OUT_MS,
          easing: Easing.out(Easing.cubic),
        }),
      );
      if (!reduced) y.set(withTiming(LIFT, { ...never, duration: MOVE_MS, easing: EASE }));
    }, leaveAt);
    const remove = setTimeout(() => dismiss(id), leaveAt + outMs);
    return () => {
      clearTimeout(leave);
      clearTimeout(remove);
    };
  }, [id, message, reduced, shown, y]);

  const animated = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: reduced ? [] : [{ translateY: y.get() }],
  }));

  return (
    <View pointerEvents="none" style={[styles.dock, { bottom: insets.bottom + ABOVE_SAFE_BOTTOM }]}>
      <Animated.View
        accessible
        accessibilityLabel={message}
        style={[
          styles.pill,
          {
            maxWidth: width - gutter * 2,
            backgroundColor: colors.textInk,
            borderColor: colors.borderGlass,
          },
          animated,
        ]}
      >
        <EchoText variant="bodyL" serif italic align="center" style={styles.text}>
          {message}
        </EchoText>
      </Animated.View>
    </View>
  );
}

/**
 * Mounted once, at the root. A quiet pill above the primary CTA and the tab bar, so it never covers
 * either. It lets every touch through, and says its line to screen readers as it appears.
 */
export function ToastHost() {
  const toast = useToasts((state) => state.toast);
  return toast ? <ToastView key={toast.id} id={toast.id} message={toast.message} /> : null;
}

const styles = StyleSheet.create({
  // Above every screen, on every platform: the web stacks screens with a z-index of their own.
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  pill: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    paddingHorizontal: tokens.space[20],
    paddingVertical: tokens.space[12],
  },
  text: { fontSize: 17, lineHeight: 22 },
});
