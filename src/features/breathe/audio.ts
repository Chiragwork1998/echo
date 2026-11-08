import { Platform } from 'react-native';

import { stopAndRelease } from '@/services/audioPlayers';
import { loadAudio } from '@/services/nativeModules';

type ExpoAudio = typeof import('expo-audio');
export type BreathPlayer = ReturnType<ExpoAudio['createAudioPlayer']>;
type AudioMode = Parameters<ExpoAudio['setAudioModeAsync']>[0];

/** How often a player reports where it is. Between reports the clock interpolates. */
export const STATUS_INTERVAL_MS = 100;

/**
 * Breathing plays when the phone is on silent, and under the person's own music rather than over it.
 * It never records and never plays on in the background.
 */
export const BREATH_AUDIO_MODE: AudioMode = {
  playsInSilentMode: true,
  interruptionMode: 'mixWithOthers',
  allowsRecording: false,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};

/**
 * The mode the journal session expects when it takes over, which is the one it leaves behind itself
 * (recorderDriver.ts and streamDriver.ts end every take with `{ allowsRecording: false }`, and set
 * their own recording mode before the next). On iOS every call sets the whole mode, so that call is
 * enough. On Android the interruption mode outlives a call that leaves it out, so Breathe's
 * `mixWithOthers` would still be in force when the session records. Android treats a mode that was
 * never set as transient focus, which is `doNotMix`, so that is what is put back.
 */
export const JOURNAL_AUDIO_MODE: AudioMode =
  Platform.OS === 'android'
    ? {
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      }
    : { allowsRecording: false };

/** expo-audio, or null where it cannot load (a build without the module, or a test). */
function audio(): ExpoAudio | null {
  try {
    return loadAudio();
  } catch {
    return null;
  }
}

/** Sound is never a reason for a practice to fail: every call here swallows its errors. */
export async function enterBreathAudio(): Promise<void> {
  await audio()
    ?.setAudioModeAsync(BREATH_AUDIO_MODE)
    .catch(() => undefined);
}

/** Puts back the mode the journal session records in. Call before handing over to it. */
export async function restoreJournalAudio(): Promise<void> {
  await audio()
    ?.setAudioModeAsync(JOURNAL_AUDIO_MODE)
    .catch(() => undefined);
}

export function createPlayer(source: number, loop: boolean): BreathPlayer | null {
  try {
    const module = audio();
    if (!module) return null;
    const player = module.createAudioPlayer(source, { updateInterval: STATUS_INTERVAL_MS });
    player.loop = loop;
    return player;
  } catch {
    return null;
  }
}

/** Silences a player and frees it, now. */
export function releasePlayer(player: BreathPlayer | null | undefined): void {
  stopAndRelease(player);
}

/**
 * Lets a player go without a click: one that is sounding fades to silence over `ms`, then stops and
 * is freed. One that is silent is freed at once.
 */
export function fadeOutAndRelease(player: BreathPlayer | null | undefined, ms: number): void {
  if (!player) return;
  let sounding = false;
  try {
    sounding = player.playing && player.volume > 0;
  } catch {
    // Released.
  }
  if (!sounding) return releasePlayer(player);
  rampVolume(player, 0, ms, () => releasePlayer(player));
}

/** A bell or a line that may still be sounding rings out for `ms` before its player is freed. */
export function releaseAfter(player: BreathPlayer | null | undefined, ms: number): void {
  if (!player) return;
  setTimeout(() => releasePlayer(player), ms);
}

const RAMP_STEP_MS = 25;

/**
 * Moves a player's volume to `to` over `ms`, in small steps. A loop never starts or stops at full
 * volume: its first sample carries on from the round before, so a hard start could tick.
 *
 * The ramp keeps to the clock, not to a count of steps. A busy phone runs every step late (the v5
 * walk measured 44 ms apart, not 25), which made a 1.2 s fade last 2.7 s; now a late step only
 * moves further, and the ramp ends on time.
 */
export function rampVolume(player: BreathPlayer, to: number, ms: number, then?: () => void) {
  let from = 0;
  try {
    from = player.volume;
  } catch {
    from = to;
  }
  const began = Date.now();
  const timer = setInterval(() => {
    const t = ms > 0 ? Math.min(1, (Date.now() - began) / ms) : 1;
    try {
      player.volume = from + (to - from) * t;
    } catch {
      // Released mid ramp.
    }
    if (t >= 1) {
      clearInterval(timer);
      then?.();
    }
  }, RAMP_STEP_MS);
  return () => clearInterval(timer);
}
