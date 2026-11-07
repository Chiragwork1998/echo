import type { BreathPlayer } from './audio';

/** A loop reported earlier than this is taken to have come round again, not to have jittered. */
const WRAP_SLACK_S = 0.25;

export type Now = () => number;
export const wallNow: Now = () => Date.now();

/**
 * How far into a loop the sound is, in milliseconds since the loop began, counting every time it has
 * come round. It is the player's own clock: its reported position, carried forward between reports
 * by the time since the last one while it plays. Visuals and haptics read this, never a timer of
 * their own, so they cannot drift from what is heard.
 */
export type Clock = {
  /** Milliseconds of the loop that have been heard, counting each time round. */
  elapsedMs(): number;
  /** The player behind it, if there is one. */
  readonly player: BreathPlayer | null;
  /** The sound has been heard to play. A clock without a player is always started. */
  started(): boolean;
  pause(): void;
  resume(): void;
  dispose(): void;
};

type Status = { currentTime: number; duration: number; playing: boolean };

/**
 * Follows a looping player. `roundMs` is the round the loop is one of: the file is that long to the
 * sample, and the clock reads its position as a share of the file, so a few samples of rounding in
 * the file can never build up.
 */
export function playerClock(player: BreathPlayer, roundMs: number, now: Now = wallNow): Clock {
  let loops = 0;
  let last: Status = { currentTime: 0, duration: roundMs / 1000, playing: false };
  let at = now();
  let heard = false;
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (!status.isLoaded) return;
    if (status.playing) heard = true;
    if (status.currentTime + WRAP_SLACK_S < last.currentTime) loops += 1;
    last = {
      currentTime: status.currentTime,
      duration: status.duration > 0 ? status.duration : last.duration,
      playing: status.playing,
    };
    at = now();
  });
  return {
    player,
    started: () => heard,
    elapsedMs() {
      const duration = last.duration > 0 ? last.duration : roundMs / 1000;
      const position = last.currentTime + (last.playing ? (now() - at) / 1000 : 0);
      // Between reports the position can run past the end: that is the next time round.
      const extra = Math.floor(position / duration);
      const within = position - extra * duration;
      return (loops + extra + within / duration) * roundMs;
    },
    pause() {
      // Freeze at the position heard so far. The player's next report confirms it.
      last = { ...last, currentTime: last.currentTime + (last.playing ? (now() - at) / 1000 : 0) };
      last.playing = false;
      at = now();
      try {
        player.pause();
      } catch {
        // Released.
      }
    },
    resume() {
      try {
        player.play();
      } catch {
        // Released.
      }
    },
    dispose() {
      subscription.remove();
    },
  };
}

/**
 * For a pattern with no sound made for it, or where audio cannot play: the same reading of time,
 * from the wall clock, with pauses taken out.
 */
export function silentClock(now: Now = wallNow): Clock {
  let base = 0;
  let since: number | null = now();
  return {
    player: null,
    started: () => true,
    elapsedMs: () => base + (since === null ? 0 : now() - since),
    pause() {
      if (since === null) return;
      base += now() - since;
      since = null;
    },
    resume() {
      if (since === null) since = now();
    },
    dispose() {},
  };
}
