import { Platform } from 'react-native';

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

export function releasePlayer(player: BreathPlayer | null | undefined): void {
  try {
    player?.remove();
  } catch {
    // Already gone.
  }
}

const RAMP_STEP_MS = 25;

/**
 * Moves a player's volume to `to` over `ms`, in small steps. A loop never starts or stops at full
 * volume: its first sample carries on from the round before, so a hard start could tick.
 */
export function rampVolume(player: BreathPlayer, to: number, ms: number, then?: () => void) {
  let from = 0;
  try {
    from = player.volume;
  } catch {
    from = to;
  }
  const steps = Math.max(1, Math.round(ms / RAMP_STEP_MS));
  let step = 0;
  const timer = setInterval(() => {
    step += 1;
    const t = step / steps;
    try {
      player.volume = from + (to - from) * t;
    } catch {
      // Released mid ramp.
    }
    if (step >= steps) {
      clearInterval(timer);
      then?.();
    }
  }, RAMP_STEP_MS);
  return () => clearInterval(timer);
}
