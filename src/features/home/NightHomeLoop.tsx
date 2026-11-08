import { usePathname } from 'expo-router';
import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import {
  NIGHT_LOOP_COVER_GRACE_MS,
  NIGHT_LOOP_WELCOME_DELAY_MS,
  NIGHT_LOOP_WELCOME_REVEAL_MS,
} from '@/design/nightLoop';
import { useTheme } from '@/design/theme';
import { tokens } from '@/design/tokens';
import { useAppForeground } from '@/design/useAppForeground';

/**
 * The routes under /home on which the plate is what the person is looking at: Home, the daily
 * session, Breathe and Rehearse, whose screens are transparent. Every other route here (Echoes,
 * Patterns, You, an entry, Completion) wears a plate of its own that covers this one.
 */
export const LOOP_PATHS: readonly string[] = [
  '/home',
  '/home/session',
  '/home/breathe',
  '/home/rehearse',
];

type SurfaceProps = { playing: boolean; revealMs?: number; revealAfterMs?: number };

// expo-video is native code. A build made before it was added cannot load it, and then the still
// simply stays: requiring the surface here, rather than importing it, turns that into a null.
function loadSurface(): ComponentType<SurfaceProps> | null {
  try {
    const surface = // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/components/NightLoopSurface') as typeof import('@/components/NightLoopSurface');
    return surface.NightLoopSurface;
  } catch {
    return null;
  }
}
const Surface = Platform.OS === 'web' ? null : loadSurface();

/** A player that throws while it is being made leaves the still, silently. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * True once Reduce Motion is known to be off. It is false until the system has answered, so a
 * person who has it on never has a player made for them, not even for a moment.
 */
export function useMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => live && setAllowed(!reduced))
      .catch(() => live && setAllowed(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) =>
      setAllowed(!reduced),
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return allowed;
}

/** True now, and for `graceMs` after `on` turns false. */
function useLingering(on: boolean, graceMs: number): boolean {
  const [away, setAway] = useState(!on);
  if (on && away) setAway(false);
  useEffect(() => {
    if (on) return;
    const timer = setTimeout(() => setAway(true), graceMs);
    return () => clearTimeout(timer);
  }, [on, graceMs]);
  return on || !away;
}

/**
 * The Night Home plate, alive (D-009). Laid by app/home/_layout.tsx over the Night still, which
 * stays beneath as the poster and as the whole of the plate when this draws nothing.
 *
 * It draws nothing, and makes no player, in Day (once Night has faded out), with Reduce Motion on, on
 * web, or where expo-video is missing. It plays only while the plate can be seen: it pauses the moment the app leaves the
 * foreground or the lock closes over it, and a moment after another screen has covered it. It plays
 * again at once, from the frame it stopped on.
 */
export function NightHomeLoop({
  suspended = false,
  welcome = false,
}: {
  suspended?: boolean;
  /** Home's first look ever: the river wakes slowly (design/nightLoop). */
  welcome?: boolean;
}) {
  const { target } = useTheme();
  const motion = useMotionAllowed();
  const foreground = useAppForeground();
  const pathname = usePathname();
  // Pausing waits for a covering screen to finish fading in. Playing does not wait.
  const visible = useLingering(LOOP_PATHS.includes(pathname), NIGHT_LOOP_COVER_GRACE_MS);

  // The Night plate fades out over 900 ms when the theme moves to Day, and the loop is part of it:
  // it plays on through the fade, and is not swapped for the still the moment the change begins.
  const night = useLingering(target === 'night', tokens.motion.atmosphere);

  if (!Surface || !night || !motion) return null;
  return (
    <Quiet>
      <Surface
        playing={visible && foreground && !suspended}
        {...(welcome
          ? {
              revealMs: NIGHT_LOOP_WELCOME_REVEAL_MS,
              revealAfterMs: NIGHT_LOOP_WELCOME_DELAY_MS,
            }
          : {})}
      />
    </Quiet>
  );
}
