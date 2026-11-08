import type { VideoPlayer } from 'expo-video';

/**
 * The living Night Home plate (D-009): a 12 second seamless loop, composited over the still Night
 * Home plate, so the river flows, the clouds move and the moon breathes while the mountains and the
 * foreground stay the still's own pixels. This is the one place that names the file. Swapping a
 * re-render is replacing assets/video/night-home-loop.mp4 (scripts/encode-night-loop.sh writes it
 * with the colour tags and the GOP the app relies on). Nothing else needs to change.
 */
export const NIGHT_LOOP_SOURCE: number = require('../../assets/video/night-home-loop.mp4');

/**
 * The still the loop was composited on, in pixels. The video is stretched onto this plate's exact
 * rectangle rather than given a fit of its own: the render is 1080 x 2340, which differs from the
 * plate's 1290 x 2796 by 0.04 percent, and a second `cover` would let that show as a sub-point drift
 * on tablets and in landscape. A re-render only has to keep the same composition.
 */
export const NIGHT_LOOP_PLATE = { width: 1290, height: 2796 } as const;

/** How long the loop takes to appear once its first frame has rendered. */
export const NIGHT_LOOP_REVEAL_MS = 700;

/**
 * The first time Home ever appears the river wakes slowly, out of the still, while the heading is
 * read: the reveal is longer, and does not begin until Home has been up for a moment. The loop is
 * only revealed more slowly, never edited (D-009), and it never holds Home back: if its first frame
 * is late the reveal simply starts late.
 */
export const NIGHT_LOOP_WELCOME_REVEAL_MS = 1800;
export const NIGHT_LOOP_WELCOME_DELAY_MS = 300;

/**
 * How long a screen that covers the plate gets to finish fading in before the loop pauses behind it.
 * Pausing earlier would freeze the river under a screen that is still half transparent.
 */
export const NIGHT_LOOP_COVER_GRACE_MS = 600;

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where a plate lands when it is drawn with `cover`, centred, in a frame: the same rectangle the
 * still's `<Image contentFit="cover" contentPosition="center">` fills. May extend past the frame on
 * the axis that is cropped.
 */
export function plateCoverRect(
  frame: { width: number; height: number },
  plate: { width: number; height: number } = NIGHT_LOOP_PLATE,
): Rect {
  const scale = Math.max(frame.width / plate.width, frame.height / plate.height);
  const width = plate.width * scale;
  const height = plate.height * scale;
  return { left: (frame.width - width) / 2, top: (frame.height - height) / 2, width, height };
}

/**
 * What the loop's player is set to, and why. The loop is scenery: it must never be heard, never take
 * audio focus from the person's music, and never disturb the microphone or the recording session.
 * The test beside this file pins every line.
 *
 * - `muted`, with `mixWithOthers`: expo-video asks for audio focus on Android and activates the audio
 *   session on iOS only for a player that is playing and not muted (or one set to `doNotMix`). The
 *   render has no audio track, and these keep it that way even if one is ever added.
 * - `staysActiveInBackground` false and no now-playing notification: nothing outlives the app.
 * - `keepScreenOnWhilePlaying` false: the default is true, which would hold the screen awake on Home.
 * - `allowsExternalPlayback` false: scenery does not start on an Apple TV.
 */
export const NIGHT_LOOP_PLAYER = {
  muted: true,
  audioMixingMode: 'mixWithOthers',
  staysActiveInBackground: false,
  showNowPlayingNotification: false,
  keepScreenOnWhilePlaying: false,
  allowsExternalPlayback: false,
  loop: true,
} as const satisfies Partial<VideoPlayer>;

/** Applies the settings above. Runs when the player is created, before it can play. */
export function configureNightLoopPlayer(player: VideoPlayer): void {
  // Silence and mixing first: they must hold before the first frame can start playback.
  player.muted = NIGHT_LOOP_PLAYER.muted;
  player.audioMixingMode = NIGHT_LOOP_PLAYER.audioMixingMode;
  player.staysActiveInBackground = NIGHT_LOOP_PLAYER.staysActiveInBackground;
  player.showNowPlayingNotification = NIGHT_LOOP_PLAYER.showNowPlayingNotification;
  player.keepScreenOnWhilePlaying = NIGHT_LOOP_PLAYER.keepScreenOnWhilePlaying;
  player.allowsExternalPlayback = NIGHT_LOOP_PLAYER.allowsExternalPlayback;
  player.loop = NIGHT_LOOP_PLAYER.loop;
}
