// WAV files, only as far as splitting a long one goes. A live take is kept as 24 kHz PCM in a WAV,
// and the voice server takes about 4.4 MB at a time, so a long take is cut into pieces that are each
// a WAV of their own. Raw PCM can be cut anywhere, so it is cut where the person was quietest.

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Where the samples begin in the file. */
  dataOffset: number;
  /** How many bytes of samples the file really holds. */
  dataBytes: number;
};

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

/**
 * Reads a WAV's format from the start of the file. The size a header declares is not to be trusted
 * in either direction. The stream writes its samples and then its header, so after a crash the header
 * can be zero, or lag the file by the last buffer, and a header larger than the file says the file
 * was cut short. The data is therefore taken to end where the file does. A trailing chunk after the
 * samples would be read as a few milliseconds of noise, which this writer never makes, and which
 * costs nothing next to losing the end of what a person said.
 */
export function parseWav(head: Uint8Array, fileSize: number): WavInfo | null {
  if (head.length < 12 || ascii(head, 0, 4) !== 'RIFF' || ascii(head, 8, 4) !== 'WAVE') return null;
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let format: Pick<WavInfo, 'sampleRate' | 'channels' | 'bitsPerSample'> | null = null;
  let at = 12;
  while (at + 8 <= head.length) {
    const id = ascii(head, at, 4);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ' && at + 24 <= head.length) {
      // 1 is plain PCM, and 0xfffe is the extensible form that carries it too.
      const tag = view.getUint16(at + 8, true);
      if (tag !== 1 && tag !== 0xfffe) return null;
      format = {
        channels: view.getUint16(at + 10, true),
        sampleRate: view.getUint32(at + 12, true),
        bitsPerSample: view.getUint16(at + 22, true),
      };
    } else if (id === 'data') {
      if (!format || format.channels < 1 || format.bitsPerSample !== 16) return null;
      const dataOffset = at + 8;
      const room = Math.max(0, fileSize - dataOffset);
      return { ...format, dataOffset, dataBytes: room - (room % (2 * format.channels)) };
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

/** The 44 bytes that make `dataBytes` of 16-bit PCM a WAV file. */
export function wavHeader(
  info: Pick<WavInfo, 'sampleRate' | 'channels'>,
  dataBytes: number,
): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const write = (at: number, text: string) =>
    [...text].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, info.channels, true);
  view.setUint32(24, info.sampleRate, true);
  view.setUint32(28, info.sampleRate * info.channels * 2, true);
  view.setUint16(32, info.channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataBytes, true);
  return header;
}

export function wavPiece(info: Pick<WavInfo, 'sampleRate' | 'channels'>, pcm: Uint8Array) {
  const piece = new Uint8Array(44 + pcm.length);
  piece.set(wavHeader(info, pcm.length), 0);
  piece.set(pcm, 44);
  return piece;
}

/** How much of a piece's end is searched for the quietest moment to cut at. */
const SEARCH_SECONDS = 8;
const QUIET_FRAME_MS = 50;

/**
 * Where to cut inside `window` (little-endian 16-bit samples, interleaved): the middle of the
 * quietest fifty milliseconds, in bytes from the start of the window and a whole sample frame in.
 */
export function quietestCut(window: Uint8Array, info: Pick<WavInfo, 'sampleRate' | 'channels'>) {
  const block = info.channels * 2;
  const frameBytes = Math.max(block, Math.round((info.sampleRate * QUIET_FRAME_MS) / 1000) * block);
  const view = new DataView(window.buffer, window.byteOffset, window.byteLength);
  let best = Math.floor(window.length / 2 / block) * block;
  let bestEnergy = Infinity;
  for (let at = 0; at + frameBytes <= window.length; at += frameBytes) {
    let energy = 0;
    for (let i = at; i < at + frameBytes; i += 2) {
      const sample = view.getInt16(i, true);
      energy += sample * sample;
    }
    // Equally quiet is later, so a stretch of silence makes the piece as long as it can be.
    if (energy <= bestEnergy) {
      bestEnergy = energy;
      best = at + Math.floor(frameBytes / 2 / block) * block;
    }
  }
  return best;
}

export type PieceRange = { start: number; end: number };

/**
 * The byte ranges of a file's samples to send one at a time, each small enough for the server once
 * a header is added. Every cut is at the quietest moment in the last few seconds before the limit,
 * so a word is not split in two. `read` returns the bytes of a range of the file.
 */
export async function planPieces(
  info: WavInfo,
  limitBytes: number,
  read: (offset: number, length: number) => Promise<Uint8Array>,
): Promise<PieceRange[]> {
  const block = info.channels * 2;
  const room = Math.floor((limitBytes - 44) / block) * block;
  const end = info.dataOffset + info.dataBytes;
  const pieces: PieceRange[] = [];
  let start = info.dataOffset;
  while (end - start > room) {
    const limit = start + room;
    const span = Math.min(room / 2, SEARCH_SECONDS * info.sampleRate * block);
    const searchFrom = limit - Math.floor(span / block) * block;
    const window = await read(searchFrom, limit - searchFrom);
    const cut = searchFrom + quietestCut(window, info);
    const at = Math.min(Math.max(cut, start + block), limit);
    pieces.push({ start, end: at });
    start = at;
  }
  if (end > start) pieces.push({ start, end });
  return pieces;
}
