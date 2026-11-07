// ADTS AAC files, only as far as cutting a long one goes. Android records a hidden take as ADTS,
// because a file cut off by a crash stays playable, and the voice server takes only so many minutes
// of sound, and so many bytes, in one request. Every ADTS frame carries its own header with its own
// length, and holds a fixed amount of sound, so a file can be cut between frames, and measured, without
// decoding anything. What cannot be known without decoding is where the person was quiet, so the
// pieces overlap by a few seconds instead, and the words are joined afterwards (joinWords.ts).
//
// A 12-bit sync word can turn up by chance inside the audio, so a place is trusted as a frame only when
// a chain of several headers follows it, each one starting exactly where the one before it ends and
// each describing the same stream.

import type { PieceRange } from './wav';

const SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];

export type AdtsHeader = {
  /** Bytes in the frame, header included. */
  length: number;
  /** What every frame of one stream has in common: version, profile, sampling rate and channels. */
  identity: number;
  sampleRate: number;
  channels: number;
  /** Samples of sound one frame holds. */
  samples: number;
};

/** The header at `at`, or null if what is there is not a plausible one. */
export function readHeader(bytes: Uint8Array, at: number): AdtsHeader | null {
  if (at < 0 || at + 7 > bytes.length) return null;
  const b0 = bytes[at]!;
  const b1 = bytes[at + 1]!;
  // Twelve ones, then layer 00. The version and protection bits are free.
  if (b0 !== 0xff || (b1 & 0xf6) !== 0xf0) return null;
  const b2 = bytes[at + 2]!;
  const b3 = bytes[at + 3]!;
  const b4 = bytes[at + 4]!;
  const b5 = bytes[at + 5]!;
  const b6 = bytes[at + 6]!;
  const headerLength = b1 & 1 ? 7 : 9;
  const rate = (b2 >> 2) & 0xf;
  const channels = ((b2 & 1) << 2) | (b3 >> 6);
  const length = ((b3 & 3) << 11) | (b4 << 3) | (b5 >> 5);
  if (rate >= SAMPLE_RATES.length || channels === 0 || length < headerLength) return null;
  return {
    length,
    identity: ((b1 >> 3) & 1) | ((b2 >> 6) << 1) | (rate << 3) | (channels << 7),
    sampleRate: SAMPLE_RATES[rate]!,
    channels,
    samples: 1024 * ((b6 & 3) + 1),
  };
}

/** Frames in a row from `at`: each starts where the last ended, and all are one stream. */
function chain(bytes: Uint8Array, at: number, identity: number | undefined): number[] {
  const found: number[] = [];
  let here = at;
  for (;;) {
    const header = readHeader(bytes, here);
    if (!header || (identity !== undefined && header.identity !== identity)) return found;
    found.push(here);
    here += header.length;
  }
}

/** Headers in a row needed before a place counts as a frame and not as chance. */
const CHAIN = 6;

/** The first place at or after `from` that starts a real chain of frames, and the chain from it. */
function firstChain(bytes: Uint8Array, from: number, identity: number | undefined) {
  for (let at = from; at + 7 <= bytes.length; at += 1) {
    if (bytes[at] !== 0xff) continue;
    const frames = chain(bytes, at, identity);
    if (frames.length >= CHAIN) return frames;
  }
  return null;
}

/** Where to look for the first frame: a file may begin with something that is not audio. */
const HEAD_SCAN = 65_536;
/** How much of the file is read at a time while its frames are followed. */
const CHUNK = 262_144;
/** How far past a frame that makes no sense to look for the next real one. */
const RESYNC = 65_536;

export type AdtsLimits = {
  /** The most sound one piece may hold. */
  seconds: number;
  /** The most bytes one piece may hold. */
  bytes: number;
  /**
   * The least sound a piece may hold. The server refuses a clip of a few seconds, and the end of a
   * take can be only the overlap and a little more, so an end shorter than this joins the piece
   * before it, which then holds up to this much more than `seconds`.
   */
  minSeconds: number;
  /** How much sound the end of one piece and the start of the next both hold. */
  overlapSeconds: number;
};

export type AdtsPlan = {
  /** Each piece begins and ends on a frame, and each begins a little before the last one ended. */
  ranges: PieceRange[];
  /** The sound the end of one piece and the start of the next both hold: whole frames. */
  overlapSeconds: number;
  /** The sound in every frame followed, once each: the take's length, overlaps not counted twice. */
  seconds: number;
};

/**
 * Cuts a long ADTS file into pieces, each within both limits and each beginning `overlapSeconds`
 * before the one before it ended. The frames are followed from the first to the last, a chunk of the
 * file at a time, so the length of every piece in sound is exact however the bitrate wandered, and
 * no more than a chunk is ever held. A file that fits is one piece. Null when the file cannot be cut
 * with confidence, which includes a file that is not ADTS at all.
 */
export async function planAdtsPieces(
  size: number,
  limits: AdtsLimits,
  read: (offset: number, length: number) => Promise<Uint8Array>,
): Promise<AdtsPlan | null> {
  const head = await read(0, Math.min(size, HEAD_SCAN));
  const opening = firstChain(head, 0, undefined);
  if (!opening) return null;
  const stream = readHeader(head, opening[0]!)!;
  const frameSeconds = stream.samples / stream.sampleRate;
  const maxFrames = Math.floor(limits.seconds / frameSeconds);
  const minFrames = Math.ceil(limits.minSeconds / frameSeconds);
  const overlap = Math.max(1, Math.ceil(limits.overlapSeconds / frameSeconds));
  if (maxFrames <= overlap * 2) return null;

  const ranges: PieceRange[] = [];
  // Where the last `overlap` frames began, as a ring: the oldest is where the next piece starts.
  const recent = new Array<number>(overlap).fill(0);
  let seen = 0;
  let start = opening[0]!;
  let inPiece = 0;
  let base = 0;
  let buffer = head;
  let at = start;

  while (at + 7 <= size) {
    if (at < base || at + 7 > base + buffer.length) {
      base = at;
      buffer = await read(at, Math.min(CHUNK, size - at));
    }
    const header = readHeader(buffer, at - base);
    if (!header || header.identity !== stream.identity) {
      // The frames stopped making sense: carry on from the next place that is really one.
      base = at;
      buffer = await read(at, Math.min(RESYNC, size - at));
      const next = firstChain(buffer, 1, stream.identity);
      if (!next) {
        // Nothing but a little junk after the last frame stays with the last piece.
        if (size - at <= RESYNC) break;
        return null;
      }
      at = base + next[0]!;
      continue;
    }
    // A frame cut short by the end of the file stays in the last piece.
    if (at + header.length > size) break;

    if (inPiece >= maxFrames || at - start + header.length > limits.bytes) {
      if (inPiece <= overlap) return null;
      ranges.push({ start, end: at });
      start = recent[seen % overlap]!;
      inPiece = overlap;
    }
    recent[seen % overlap] = at;
    seen += 1;
    inPiece += 1;
    at += header.length;
  }
  const before = ranges.at(-1);
  if (before && inPiece < minFrames && size - before.start <= limits.bytes) {
    ranges.pop();
    start = before.start;
  }
  ranges.push({ start, end: size });
  return { ranges, overlapSeconds: overlap * frameSeconds, seconds: seen * frameSeconds };
}
