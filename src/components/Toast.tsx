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

import { useLayout } from '@/design/layout';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useReduceMotion } from '@/design/useReduceMotion';

import { EchoText } from './EchoText';

// Long enough to read a short line and to hear it, short enough to stay out of the way.
const DWELL_MS = 2800;
const RISE = 8;
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
  // Reduce Motion: opacity only, and no longer than a button press. Otherwise a slow fade and rise.
  const ms = reduced ? tokens.motion.fast : tokens.motion.standard;

  useEffect(() => {
    void AccessibilityInfo.announceForAccessibility(message);
    const timing = {
      duration: ms,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    };
    shown.set(withTiming(1, timing));
    const leave = setTimeout(() => shown.set(withTiming(0, timing)), ms + DWELL_MS);
    const remove = setTimeout(() => dismiss(id), ms + DWELL_MS + ms);
    return () => {
      clearTimeout(leave);
      clearTimeout(remove);
    };
  }, [id, message, ms, shown]);

  const animated = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: reduced ? [] : [{ translateY: (1 - shown.get()) * RISE }],
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
