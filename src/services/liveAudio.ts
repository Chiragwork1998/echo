// The sound side of live words. Pure functions over PCM, with no network and no native module, so
// that a phone and a Node script can run the very same code. Nothing here is logged or kept.

/** What the live model takes: 24 kHz, mono, 16-bit. */
export const LIVE_RATE = 24_000;

/** Interleaved samples to mono, by averaging the channels. */
export function toMono(samples: Int16Array, channels: number): Int16Array {
  if (channels <= 1) return samples;
  const frames = Math.floor(samples.length / channels);
  const mono = new Int16Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) sum += samples[i * channels + c]!;
    mono[i] = Math.round(sum / channels);
  }
  return mono;
}

/**
 * A resampler that keeps its place between buffers, so a stream can be fed in whatever pieces the
 * microphone delivers. Each output sample is the average of the input it covers, which is also a
 * low-pass for the common case of coming down from 44.1 or 48 kHz.
 */
export function createResampler(from: number, to: number): (input: Int16Array) => Int16Array {
  if (from === to) return (input) => input;
  const ratio = from / to;
  let carry = new Float64Array(0);
  let start = 0;
  return (input) => {
    const buffer = new Float64Array(carry.length + input.length);
    buffer.set(carry);
    for (let i = 0; i < input.length; i += 1) buffer[carry.length + i] = input[i]!;

    const out = new Int16Array(Math.floor((buffer.length - start) / ratio) + 1);
    let written = 0;
    let position = start;
    while (position + ratio <= buffer.length + 1e-9) {
      const end = Math.min(position + ratio, buffer.length);
      let index = Math.floor(position);
      let cursor = position;
      let sum = 0;
      while (cursor < end - 1e-12 && index < buffer.length) {
        const next = Math.min(index + 1, end);
        sum += buffer[index]! * (next - cursor);
        cursor = next;
        index += 1;
      }
      out[written] = Math.max(-32768, Math.min(32767, Math.round(sum / ratio)));
      written += 1;
      position += ratio;
    }
    const keep = Math.min(Math.floor(position), buffer.length);
    carry = buffer.slice(keep);
    start = position - keep;
    return out.slice(0, written);
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of the samples' little-endian bytes. Written out because Hermes has no Buffer. */
export function pcmToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i]!;
    bytes[i * 2] = value & 0xff;
    bytes[i * 2 + 1] = (value >> 8) & 0xff;
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(triple >> 18) & 63]! + ALPHABET[(triple >> 12) & 63]!;
    out += b === undefined ? '=' : ALPHABET[(triple >> 6) & 63]!;
    out += c === undefined ? '=' : ALPHABET[triple & 63]!;
  }
  return out;
}

/** What the detector settled on: how long a pause is a pause, and how long one turn may run. */
export const TURN = {
  /** A silence this long, after speech, ends a turn. */
  pauseMs: 1_200,
  /** A turn this long is ended even if the person has not paused. */
  maxMs: 30_000,
  /** Less speech than this is a click or a breath, not a turn. */
  minSpeechMs: 300,
  frameMs: 100,
} as const;

export type TurnOptions = Partial<{
  pauseMs: number;
  maxMs: number;
  minSpeechMs: number;
}>;

export type TurnDetector = {
  /** Feed samples. Returns true once for each turn that has just ended. */
  push(samples: Int16Array): number;
  /** The capture is over: is there a turn that has not been ended yet? */
  pending(): boolean;
};

/**
 * Simple voice detection to find the pauses, because the live model does not. It is deliberately
 * plain: the loudness of each tenth of a second against a floor that follows the room's noise. A
 * miss costs nothing but a later commit, since words stream whether or not a turn has been ended.
 * Returns how many turns ended in what was pushed.
 */
export function createTurnDetector(
  options: TurnOptions = {},
  sampleRate: number = LIVE_RATE,
): TurnDetector {
  const pauseMs = options.pauseMs ?? TURN.pauseMs;
  const maxMs = options.maxMs ?? TURN.maxMs;
  const minSpeechMs = options.minSpeechMs ?? TURN.minSpeechMs;
  const frameSize = Math.round((sampleRate * TURN.frameMs) / 1000);

  let frame = new Int16Array(frameSize);
  let filled = 0;
  let floor = 150;
  let speechMs = 0;
  let silenceMs = 0;
  let turnMs = 0;

  const settle = (): boolean => {
    let sum = 0;
    for (let i = 0; i < frameSize; i += 1) sum += frame[i]! * frame[i]!;
    const rms = Math.sqrt(sum / frameSize);
    const threshold = Math.min(2_500, Math.max(250, floor * 3));
    const speaking = rms > threshold;
    if (!speaking) floor = rms < floor ? (rms + floor) / 2 : floor + (rms - floor) * 0.02;

    turnMs += TURN.frameMs;
    if (speaking) {
      speechMs += TURN.frameMs;
      silenceMs = 0;
    } else {
      silenceMs += TURN.frameMs;
      // A click in a quiet room is not the start of a turn.
      if (silenceMs >= pauseMs && speechMs < minSpeechMs) {
        speechMs = 0;
        turnMs = 0;
      }
    }
    const paused = speechMs >= minSpeechMs && silenceMs >= pauseMs;
    const long = speechMs >= minSpeechMs && turnMs >= maxMs;
    if (paused || long) {
      speechMs = 0;
      silenceMs = 0;
      turnMs = 0;
      return true;
    }
    // Long silence with nothing said: nothing to keep counting.
    if (speechMs === 0 && turnMs >= maxMs) turnMs = 0;
    return false;
  };

  return {
    push(samples) {
      let ended = 0;
      let at = 0;
      while (at < samples.length) {
        const take = Math.min(frameSize - filled, samples.length - at);
        frame.set(samples.subarray(at, at + take), filled);
        filled += take;
        at += take;
        if (filled === frameSize) {
          if (settle()) ended += 1;
          frame = new Int16Array(frameSize);
          filled = 0;
        }
      }
      return ended;
    },
    pending: () => speechMs >= minSpeechMs || (filled > 0 && speechMs > 0),
  };
}
